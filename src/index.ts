import {isAbsolute, join, relative} from "path";

import type {Observable} from "rxjs";
import {concatAll, count, endWith, filter, from, map, mergeMap, mergeWith, of, scan} from "rxjs";
import {
    getModifiedFilenames,
    index,
    resolveNearestGitDirectoryParent,
    workingTree
} from "./git-utils";
import {generateFilesWhitelistPredicate, noLineChangeDataError} from "./utils";
import {preciseFormatterPrettier} from "./precise-formatters/prettier";
import {ModifiedFile} from "./modified-file";

export interface AdditionalOptions {
    checkOnly: boolean;
    filesWhitelist: string[] | null;
    base: string | null;
    head: string | null;
}

export type State = Initializing | Running | Finished;

export interface Initializing {
    readonly state: "Initializing";
}

export interface Running {
    readonly state: "Running";
    readonly gitSearchComplete: boolean;
    readonly files: readonly FileState[];
}

export interface FileState {
    readonly filename: string;
    readonly status: FileStatus;
}

export type FileStatus = "Processing" | "NotUpdated" | "Updated" | "InvalidFormatting";

export interface Finished {
    readonly state: "Finished";
    readonly fileCount: number;
}

/**
 * LIBRARY
 */
export function main(
    workingDirectory: string,
    additionalOptions: AdditionalOptions
): Observable<State> {
    // Merge user-given and default options.
    return of({
        ...{
            filesWhitelist: null,
            base: null,
            head: null,
            checkOnly: false,
            formatter: "prettier"
        },
        ...additionalOptions
    }).pipe(
        mergeMap(async options => {
            // Note: Will be exposed as an option if/when new formatters are added.
            if (options.formatter !== "prettier") {
                throw new Error(`The only supported value for "formatter" option is "prettier"`);
            }

            const selectedFormatter = preciseFormatterPrettier;

            // Resolve the relevant .git directory's parent directory up front, as we will need this when
            // executing various `git` commands.
            const gitDirectoryParent = await resolveNearestGitDirectoryParent(workingDirectory);

            // Find files that we should process. A file is relevant if:
            //  * The file extension is supported by the given formatter.
            //  * The file is included in the optional `filesWhitelist` array, or no whitelist is specified.
            //  * The file is not ignored as a result of any supported "ignore" mechanism of the formatter.
            const relevantFiles = from(
                getModifiedFilenames(gitDirectoryParent, options.base, options.head)
            ).pipe(
                mergeMap(array => array),
                map(path => join(gitDirectoryParent, path)),
                map(path => relative(workingDirectory, path)),
                filter(path => !isAbsolute(path)),
                filter(selectedFormatter.hasSupportedFileExtension),
                filter(generateFilesWhitelistPredicate(options.filesWhitelist)),
                filter(selectedFormatter.generateIgnoreFilePredicate(workingDirectory))
            );

            const newFileEvents = relevantFiles.pipe(
                map((filename, fileIndex) => ({event: "NewFile", fileIndex, filename} as const))
            );

            const gitSearchCompleteEvent = relevantFiles.pipe(
                count(),
                map(fileCount => ({event: "GitSearchComplete", fileCount} as const))
            );

            const fileProcessedEvents = relevantFiles.pipe(
                mergeMap(async (filename, fileIndex) => {
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
                        return {
                            event: "FileProcessed",
                            fileIndex,
                            filename,
                            status: "NotUpdated"
                        } as const;
                    }

                    // Calculate what character ranges have been affected in the modified file.
                    // If any of the analysis threw an error for any reason, it will be returned
                    // from the method so we can handle it here.
                    const {err} = modifiedFile.calculateModifiedCharacterRanges();
                    if (err != null) {
                        if (err.message === noLineChangeDataError) {
                            return {
                                event: "FileProcessed",
                                fileIndex,
                                filename,
                                status: "NotUpdated"
                            } as const;
                        }

                        // Unexpected error
                        throw err;
                    }

                    // "CHECK ONLY MODE"
                    if (options.checkOnly) {
                        return {
                            event: "FileProcessed",
                            fileIndex,
                            filename,
                            status: modifiedFile.hasValidFormattingForCharacterRanges()
                                ? "NotUpdated"
                                : "InvalidFormatting"
                        } as const;
                    }

                    // "FORMAT MODE"
                    modifiedFile.formatCharacterRangesWithinContents();
                    if (!modifiedFile.shouldContentsBeUpdatedOnDisk()) {
                        return {
                            event: "FileProcessed",
                            fileIndex,
                            filename,
                            status: "NotUpdated"
                        } as const;
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
                    return {
                        event: "FileProcessed",
                        fileIndex,
                        filename,
                        status: "Updated"
                    } as const;
                })
            );

            return newFileEvents.pipe(mergeWith(gitSearchCompleteEvent, fileProcessedEvents));
        }),
        concatAll(),
        endWith({event: "Finished"} as const),
        scan(
            (state: State, event) => {
                if (event.event === "NewFile") {
                    if (state.state === "Running") {
                        return {
                            ...state,
                            files: [
                                ...state.files,
                                {
                                    filename: event.filename,
                                    status: "Processing"
                                }
                            ]
                        } as const;
                    } else {
                        return {
                            state: "Running",
                            gitSearchComplete: false,
                            files: [{filename: event.filename, status: "Processing"}]
                        } as const;
                    }
                } else if (event.event === "GitSearchComplete") {
                    if (state.state === "Running") {
                        return {...state, gitSearchComplete: true} as const;
                    } else {
                        return {state: "Running", gitSearchComplete: true, files: []} as const;
                    }
                } else if (event.event === "FileProcessed") {
                    if (state.state === "Running") {
                        const files = [...state.files];
                        files[event.fileIndex] = {
                            filename: event.filename,
                            status: event.status
                        };
                        return {...state, files} as const;
                    } else {
                        return {
                            state: "Running",
                            gitSearchComplete: false,
                            files: [
                                {
                                    filename: event.filename,
                                    status: event.status
                                }
                            ]
                        } as const;
                    }
                } else if (event.event === "Finished") {
                    if (state.state === "Running") {
                        return {state: "Finished", fileCount: state.files.length} as const;
                    } else {
                        return {state: "Finished", fileCount: 0} as const;
                    }
                } else {
                    return state;
                }
            },
            {state: "Initializing"}
        )
    );
}
