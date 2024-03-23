import * as fs from "fs";
import {extname, join} from "path";
import ignore from "ignore";
import type {Options as PrettierOptions} from "prettier";
import {getSupportInfo, format, resolveConfig, check} from "prettier";
import type {PreciseFormatter} from "../precise-formatter";
import type {CharacterRange} from "../utils";

let prettierSupportedFileExtensions: string[] = [];
getSupportInfo().languages.forEach(language => {
    prettierSupportedFileExtensions = [
        ...prettierSupportedFileExtensions,
        ...(language.extensions ?? [])
    ];
});

export const preciseFormatterPrettier: PreciseFormatter<PrettierOptions> = {
    /**
     * Resolve the relevant prettier config for the given
     * modified file path.
     */
    resolveConfig: async (modifiedFilePath: string) =>
        resolveConfig(modifiedFilePath, {useCache: false}).then(config => ({
            ...config,
            filepath: modifiedFilePath
        })),
    /**
     * Return true if the whole file has already been formatted appropriately based on
     * the resolved prettier config. We can use this as a check to skip unnecessary work.
     */
    isAlreadyFormatted: async (fileContents: string, config: PrettierOptions | null) =>
        check(fileContents, {...config}),
    /**
     * Run prettier's check mode on the given ranges and return true if they are all
     * already formatted appropriately based on the given prettier config.
     */
    checkFormattingOfRanges: async (
        filePath: string,
        fileContents: string,
        config: PrettierOptions | null,
        characterRanges: CharacterRange[]
    ) => {
        const formattedContents = fileContents;
        return characterRanges.every(characterRange =>
            check(formattedContents, {
                ...config,
                filepath: filePath,
                rangeStart: characterRange.rangeStart,
                rangeEnd: characterRange.rangeEnd
            })
        );
    },
    /**
     * Run prettier on each character range pair given, and apply the
     * difference as a patch to the original contents using an implementation
     * of the Myer's diff algorithm.
     */
    formatRanges: async (
        filePath: string,
        fileContents: string,
        config: PrettierOptions | null,
        characterRanges: CharacterRange[]
    ) =>
        // Start from the last character range and work backwards so that
        // we don't have to update character ranges to account for the changes
        // we've already made.
        characterRanges.reduceRight(
            (fileContents, {rangeStart, rangeEnd}) =>
                format(fileContents, {
                    ...config,
                    filepath: filePath,
                    rangeStart,
                    rangeEnd
                }),
            fileContents
        ),
    /**
     * Generate a predicate function which will return true if the filename
     * is not excluded via a .prettierignore file.
     */
    generateIgnoreFilePredicate: (workingDirectory: string) => {
        const prettierIgnoreFilePath = join(workingDirectory, ".prettierignore");
        /**
         * If there is no .prettierignore file present, simply always return true
         * from the predicate
         */
        if (!fs.existsSync(prettierIgnoreFilePath)) {
            return () => true;
        }
        /**
         * Use "ignore"'s createFilter() method to create a predicate
         */
        const prettierIgnoreFileContents = fs.readFileSync(prettierIgnoreFilePath, "utf8");
        return ignore().add(prettierIgnoreFileContents).createFilter();
    },
    /**
     * Return true if prettier supports the file extension of the given
     * filename.
     */
    hasSupportedFileExtension: (filename: string) => {
        const fileExtension = extname(filename);
        return prettierSupportedFileExtensions.includes(fileExtension);
    }
};
