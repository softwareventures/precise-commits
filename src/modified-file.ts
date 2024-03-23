import {relative, sep, posix} from "path";
import {readFile, writeFile} from "fs/promises";
import {notNull} from "@softwareventures/nullable";
import execa = require("execa");
import type {CharacterRange} from "./utils";
import {calculateCharacterRangesFromLineChanges, extractLineChangeData} from "./utils";
import {getDiffForFile, index, workingTree} from "./git-utils";
import type {PreciseFormatter} from "./precise-formatter";
import {assertInstanceOf} from "./unknown";

export interface ModifiedFileConfig<TFormatterConfig> {
    fullPath: string;
    gitDirectoryParent: string;
    base: string | null;
    head: string | typeof index | typeof workingTree;
    selectedFormatter: PreciseFormatter<TFormatterConfig>;
}

export class ModifiedFile<TFormatterConfig> {
    /**
     * The final file contents, after we've run the formatter
     */
    private formattedFileContents: string | null = null;
    /**
     * The calculated character ranges which have been modified
     * within this file
     */
    private modifiedCharacterRanges: CharacterRange[] = [];

    private constructor(
        private readonly fullPath: string,
        private readonly pathInGit: string,
        /**
         * The parent directory of the relevant .git directory that was resolved
         * for the modified file.
         */
        private readonly gitDirectoryParent: string,
        /**
         * An optional commit SHA pair which will be used to inform how the git
         * commands are run. E.g. `git diff`
         */
        private readonly base: string | null,
        private readonly head: string | typeof index | typeof workingTree,
        /**
         * The chosen formatter to be run on the modified file.
         */
        private readonly selectedFormatter: PreciseFormatter<TFormatterConfig>,
        /**
         * The contents of the file in their current state on the user's file
         * system
         */
        private readonly fileContents: string,
        /**
         * The resolved formatter config which applies to this file
         */
        private readonly formatterConfig: TFormatterConfig | null
    ) {}

    public static async read<TFormatterConfig>({
        fullPath,
        gitDirectoryParent,
        base,
        head,
        selectedFormatter
    }: ModifiedFileConfig<TFormatterConfig>): Promise<ModifiedFile<TFormatterConfig>> {
        const pathInGit = relative(gitDirectoryParent, fullPath).split(sep).join(posix.sep);
        const fileContents =
            head === workingTree
                ? await readFile(fullPath, "utf8")
                : head === index
                ? (
                      await execa("git", ["show", `:0:${pathInGit}`], {
                          cwd: gitDirectoryParent,
                          stripFinalNewline: false
                      })
                  ).stdout
                : (
                      await execa("git", ["show", `${head}:${pathInGit}`], {
                          cwd: gitDirectoryParent,
                          stripFinalNewline: false
                      })
                  ).stdout;
        const formatterConfig = await selectedFormatter.resolveConfig(fullPath);
        return new ModifiedFile(
            fullPath,
            pathInGit,
            gitDirectoryParent,
            base,
            head,
            selectedFormatter,
            fileContents,
            formatterConfig
        );
    }

    /**
     * Return true if the whole file has already been formatted appropriately based on
     * the resolved formatter config. We can use this as a check to skip unnecessary work.
     */
    public isAlreadyFormatted(): boolean {
        return this.selectedFormatter.isAlreadyFormatted(this.fileContents, this.formatterConfig);
    }

    /**
     * Run the formatters check mode on the given ranges and return true if they are all
     * already formatted appropriately based on the resolved formatter config.
     */
    public hasValidFormattingForCharacterRanges(): boolean {
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
    public formatCharacterRangesWithinContents(): void {
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
    public shouldContentsBeUpdatedOnDisk(): boolean {
        return this.fileContents !== this.formattedFileContents;
    }

    /**
     * Write the updated file contents back to disk.
     */
    public async updateFileOnDisk(): Promise<void> {
        if (this.head === index) {
            const hash = (
                await execa("git", ["hash-object", "-w", "--path", this.fullPath, "--stdin"], {
                    cwd: this.gitDirectoryParent,
                    input: notNull(this.formattedFileContents)
                })
            ).stdout;
            const mode = (
                await execa("git", ["ls-files", "--stage", "--", this.fullPath], {
                    cwd: this.gitDirectoryParent
                })
            ).stdout.split(" ")?.[0];
            if (mode == null) {
                throw new Error("Can't find file in git index");
            }
            await execa(
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
            await writeFile(this.fullPath, notNull(this.formattedFileContents));
        }
    }

    /**
     * We handle errors locally within this method to allow for
     * more granular feedback within the main() function of the
     * library.
     */
    public async calculateModifiedCharacterRanges(): Promise<{err: Error | null}> {
        try {
            /**
             * Extract line change data from the git diff results.
             */
            const diff = await getDiffForFile(
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
