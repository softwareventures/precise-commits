import {readFileSync, writeFileSync} from "fs";
import {relative, sep, posix} from "path";
import {notNull} from "@softwareventures/nullable";
import execa = require("execa");
import type {CharacterRange} from "./utils";
import {
    calculateCharacterRangesFromLineChanges,
    extractLineChangeData
} from "./utils";
import {getDiffForFile, index, workingTree} from "./git-utils";
import type {PreciseFormatter} from "./precise-formatter";
import {assertInstanceOf} from "./unknown";

export interface ModifiedFileConfig {
    fullPath: string;
    gitDirectoryParent: string;
    base: string | null;
    head: string | typeof index | typeof workingTree;
    selectedFormatter: PreciseFormatter<any>;
}

export class ModifiedFile {
    private readonly fullPath: string;
    private readonly pathInGit: string;
    /**
     * An optional commit SHA pair which will be used to inform how the git
     * commands are run. E.g. `git diff`
     */
    private readonly base: string | null;
    private readonly head: string | typeof index | typeof workingTree;
    /**
     * The chosen formatter to be run on the modified file.
     */
    private readonly selectedFormatter: PreciseFormatter<any>;
    /**
     * The parent directory of the relevant .git directory that was resolved
     * for the modified file.
     */
    private readonly gitDirectoryParent: string;
    /**
     * The contents of the file in their current state on the user's file
     * system
     */
    private readonly fileContents: string;
    /**
     * The final file contents, after we've run the formatter
     */
    private formattedFileContents: string | null = null;
    /**
     * The resolved formatter config which applies to this file
     */
    private readonly formatterConfig: object | null;
    /**
     * The calculated character ranges which have been modified
     * within this file
     */
    private modifiedCharacterRanges: CharacterRange[] = [];

    constructor({fullPath, gitDirectoryParent, base, head, selectedFormatter}: ModifiedFileConfig) {
        this.fullPath = fullPath;
        this.pathInGit = relative(gitDirectoryParent, fullPath).split(sep).join(posix.sep);
        this.gitDirectoryParent = gitDirectoryParent;
        this.base = base;
        this.head = head;
        this.selectedFormatter = selectedFormatter;
        this.fileContents =
            head === workingTree
                ? readFileSync(this.fullPath, "utf8")
                : head === index
                ? execa.sync("git", ["show", `:0:${this.pathInGit}`], {
                      cwd: gitDirectoryParent,
                      stripFinalNewline: false
                  }).stdout
                : execa.sync("git", ["show", `${head}:${this.pathInGit}`], {
                      cwd: gitDirectoryParent,
                      stripFinalNewline: false
                  }).stdout;
        this.formatterConfig = this.selectedFormatter.resolveConfig(this.fullPath);
    }

    /**
     * Return true if the whole file has already been formatted appropriately based on
     * the resolved formatter config. We can use this as a check to skip unnecessary work.
     */
    isAlreadyFormatted(): boolean {
        return this.selectedFormatter.isAlreadyFormatted(this.fileContents, this.formatterConfig);
    }

    /**
     * Run the formatters check mode on the given ranges and return true if they are all
     * already formatted appropriately based on the resolved formatter config.
     */
    hasValidFormattingForCharacterRanges(): boolean {
        return this.selectedFormatter.checkFormattingOfRanges(
            this.fullPath,
            this.fileContents,
            this.formatterConfig,
            this.modifiedCharacterRanges
        );
    }

    /**
     * Run the formatter on the file contents and store the result
     */
    formatCharacterRangesWithinContents(): void {
        this.formattedFileContents = this.selectedFormatter.formatRanges(
            this.fullPath,
            this.fileContents,
            this.formatterConfig,
            this.modifiedCharacterRanges
        );
    }

    /**
     * Return true if the formatted file contents are different to
     * what was originally resolved from disk.
     */
    shouldContentsBeUpdatedOnDisk(): boolean {
        return this.fileContents !== this.formattedFileContents;
    }

    /**
     * Write the updated file contents back to disk.
     */
    updateFileOnDisk(): void {
        if (this.head === index) {
            const hash = execa.sync(
                "git",
                ["hash-object", "-w", "--path", this.fullPath, "--stdin"],
                {
                    cwd: this.gitDirectoryParent,
                    input: notNull(this.formattedFileContents)
                }
            ).stdout;
            const mode = execa
                .sync("git", ["ls-files", "--stage", "--", this.fullPath], {
                    cwd: this.gitDirectoryParent
                })
                .stdout.split(" ")?.[0];
            if (mode == null) {
                throw new Error("Can't find file in git index");
            }
            execa.sync(
                "git",
                [
                    "update-index",
                    "--add",
                    "--replace",
                    "--cacheinfo",
                    `100644,${hash},${this.pathInGit}`
                ],
                {cwd: this.gitDirectoryParent}
            );
        } else {
            writeFileSync(this.fullPath, notNull(this.formattedFileContents));
        }
    }

    /**
     * We handle errors locally within this method to allow for
     * more granular feedback within the main() function of the
     * library.
     */
    calculateModifiedCharacterRanges(): {err: Error | null} {
        try {
            /**
             * Extract line change data from the git diff results.
             */
            const diff = getDiffForFile(
                this.gitDirectoryParent,
                this.fullPath,
                this.base,
                this.head
            );
            const lineChangeData = extractLineChangeData(diff);
            /**
             * Convert the line change data into character data.
             */
            this.modifiedCharacterRanges = calculateCharacterRangesFromLineChanges(
                lineChangeData,
                this.fileContents
            );
            return {err: null};
        } catch (err) {
            return {err: assertInstanceOf(err, Error)};
        }
    }
}
