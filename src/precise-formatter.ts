import type {CharacterRange} from "./utils";

/**
 * Any registered precise-formatters must implement this interface
 */
export interface PreciseFormatter<TFormatterConfig> {
    /**
     * Resolve the formatter config which is relevant for the given file path.
     */
    resolveConfig: (modifiedFilePath: string) => Promise<TFormatterConfig | null>;
    /**
     * Return true if the file contents are already formatted in accordance
     * with the given config.
     */
    isAlreadyFormatted: (
        fileContents: string,
        formatterConfig: TFormatterConfig | null
    ) => Promise<boolean>;
    /**
     * Check the formatting of the file contents, using the given config
     * and character range info.
     */
    checkFormattingOfRanges: (
        filePath: string,
        fileContents: string,
        config: TFormatterConfig | null,
        characterRanges: CharacterRange[]
    ) => Promise<boolean>;
    /**
     * Run the formatter on the file contents, using the given config and
     * character range info.
     */
    formatRanges: (
        filePath: string,
        fileContents: string,
        config: TFormatterConfig | null,
        characterRanges: CharacterRange[]
    ) => Promise<string>;
    /**
     * Function which creates a callback function which will be
     * used as a predicate when filtering the modified files returned
     * from the git analysis.
     */
    generateIgnoreFilePredicate: (workingDirectory: string) => (filename: string) => boolean;
    /**
     * Return true if the given filename has a file extension which is
     * supported by the formatter.
     */
    hasSupportedFileExtension: (filename: string) => boolean;
}
