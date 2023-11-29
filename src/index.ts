import {isAbsolute, join, relative} from "path";

import type {Observable} from "rxjs";
import {
    getModifiedFilenames,
    index,
    resolveNearestGitDirectoryParent,
    workingTree
} from "./git-utils";
import {noLineChangeDataError, generateFilesWhitelistPredicate} from "./utils";
import {ModifiedFile} from "./modified-file";
import {preciseFormatterPrettier} from "./precise-formatters/prettier";
import {observeAsync} from "./observable";

export type ProcessingStatus = "NOT_UPDATED" | "UPDATED" | "INVALID_FORMATTING";

export interface AdditionalOptions {
    checkOnly: boolean;
    filesWhitelist: string[] | null;
    base: string | null;
    head: string | null;
}

export interface InitEvent {
    readonly event: "Init";
    readonly workingDirectory: string;
}

export interface ModifiedFilesDetectedEvent {
    readonly event: "ModifiedFilesDetected";
    readonly modifiedFiles: readonly string[];
}

export interface BegunProcessingFileEvent {
    readonly event: "BegunProcessingFile";
    readonly filename: string;
    readonly index: number;
    readonly totalFiles: number;
}

export interface FinishedProcessingFileEvent {
    readonly event: "FinishedProcessingFile";
    readonly filename: string;
    readonly status: ProcessingStatus;
    readonly index: number;
    readonly totalFiles: number;
}

export interface CompleteEvent {
    readonly event: "Complete";
    readonly totalFiles: number;
}

export type Event =
    | InitEvent
    | ModifiedFilesDetectedEvent
    | BegunProcessingFileEvent
    | FinishedProcessingFileEvent
    | CompleteEvent;

/**
 * LIBRARY
 */
export function main(
    workingDirectory: string,
    additionalOptions: AdditionalOptions
): Observable<Event> {
    return observeAsync(async ({emit}) => {
        // Merge user-given and default options.
        const options = {
            ...{
                filesWhitelist: null,
                base: null,
                head: null,
                checkOnly: false,
                formatter: "prettier"
            },
            ...additionalOptions
        };

        // Note: Will be exposed as an option if/when new formatters are added.
        if (options.formatter !== "prettier") {
            throw new Error(`The only supported value for "formatter" option is "prettier"`);
        }

        const selectedFormatter = preciseFormatterPrettier;

        emit({event: "Init", workingDirectory});

        // Resolve the relevant .git directory's parent directory up front, as we will need this when
        // executing various `git` commands.
        const gitDirectoryParent = await resolveNearestGitDirectoryParent(workingDirectory);

        // We fundamentally check whether or not the file extensions are supported by the given formatter,
        // whether or not they are included in the optional `filesWhitelist` array, and that the user
        // has not chosen to ignore them via any supported "ignore" mechanism of the formatter.
        const modifiedFiles = getModifiedFilenames(gitDirectoryParent, options.base, options.head)
            .map(path => join(gitDirectoryParent, path))
            .map(path => relative(workingDirectory, path))
            .filter(path => !isAbsolute(path))
            .filter(selectedFormatter.hasSupportedFileExtension)
            .filter(generateFilesWhitelistPredicate(options.filesWhitelist))
            .filter(selectedFormatter.generateIgnoreFilePredicate(workingDirectory));

        const totalFiles = modifiedFiles.length;
        emit({event: "ModifiedFilesDetected", modifiedFiles});

        // Process each file synchronously.
        modifiedFiles.forEach((filename, fileIndex) => {
            emit({event: "BegunProcessingFile", filename, index: fileIndex, totalFiles});

            const fullPath = join(workingDirectory, filename);

            // Read the modified file contents and resolve the relevant formatter.
            const modifiedFile = new ModifiedFile({
                fullPath,
                gitDirectoryParent,
                base: options.base,
                head: options.head ?? index,
                selectedFormatter
            });

            // To avoid unnecessary issues with 100% valid files producing issues when parts
            // of them are reformatted in isolation, we first check the whole file to see if
            // it is already formatted. This could also allow us to skip unnecessary git diff
            // analysis work.
            if (modifiedFile.isAlreadyFormatted()) {
                return void emit({
                    event: "FinishedProcessingFile",
                    filename,
                    status: "NOT_UPDATED",
                    index: fileIndex,
                    totalFiles
                });
            }

            // Calculate what character ranges have been affected in the modified file.
            // If any of the analysis threw an error for any reason, it will be returned
            // from the method so we can handle it here.
            const {err} = modifiedFile.calculateModifiedCharacterRanges();
            if (err != null) {
                if (err.message === noLineChangeDataError) {
                    return void emit({
                        event: "FinishedProcessingFile",
                        filename,
                        status: "NOT_UPDATED",
                        index: fileIndex,
                        totalFiles
                    });
                }

                // Unexpected error
                throw err;
            }

            // "CHECK ONLY MODE"
            if (options.checkOnly) {
                return void emit({
                    event: "FinishedProcessingFile",
                    filename,
                    status: modifiedFile.hasValidFormattingForCharacterRanges()
                        ? "NOT_UPDATED"
                        : "INVALID_FORMATTING",
                    index: fileIndex,
                    totalFiles
                });
            }

            // "FORMAT MODE"
            modifiedFile.formatCharacterRangesWithinContents();
            if (!modifiedFile.shouldContentsBeUpdatedOnDisk()) {
                return void emit({
                    event: "FinishedProcessingFile",
                    filename,
                    status: "NOT_UPDATED",
                    index: fileIndex,
                    totalFiles
                });
            }

            // If we're updating the index, we also need to update the working tree.
            if (options.head == null) {
                const workingTreeFile = new ModifiedFile({
                    fullPath,
                    gitDirectoryParent,
                    base: options.base,
                    head: workingTree,
                    selectedFormatter
                });
                const {err} = workingTreeFile.calculateModifiedCharacterRanges();
                if (err == null) {
                    workingTreeFile.formatCharacterRangesWithinContents();
                    if (workingTreeFile.shouldContentsBeUpdatedOnDisk()) {
                        workingTreeFile.updateFileOnDisk();
                    }
                } else if (err.message !== noLineChangeDataError) {
                    // Unexpected error
                    throw err;
                }
            }

            // Write the file back to disk and report.
            modifiedFile.updateFileOnDisk();
            emit({
                event: "FinishedProcessingFile",
                filename,
                status: "UPDATED",
                index: fileIndex,
                totalFiles
            });
        });

        // Report that all files have finished processing.
        emit({event: "Complete", totalFiles});
    });
}
