import * as execa from "execa";
import {notNull} from "@softwareventures/nullable";
import type {ExecaReturnValue} from "execa";

export interface LineChanges {
    start: number;
    noOfLines: number;
}

export interface LineChangeData {
    removals: LineChanges[];
    additions: LineChanges[];
}

export interface CharacterRange {
    rangeStart: number;
    rangeEnd: number;
}

export const noLineChangeDataError = "No line change data could be detected";

/**
 * Addition `start` number included in the range,
 * removal `start` is the line before
 */
export function extractLineChangeData(diffData: string): LineChangeData {
    const lineChanges = diffData.match(/^@@.*@@/gmu);
    if (lineChanges == null) {
        throw new Error(noLineChangeDataError);
    }
    const lineChangeData: {
        removals: LineChanges[];
        additions: LineChanges[];
    } = {
        removals: [],
        additions: []
    };
    lineChanges.forEach(lineChange => {
        const d = lineChange.match(/^(@@ )-(\d+,?\d*)( )\+(\d+,?\d*)( @@)/u);
        if (d == null) {
            throw new Error("The detected line change data could be not be parsed");
        }
        const [removalStartLine, noOfLinesRemoved = 1] = notNull(d[2])
            .split(",")
            .map(s => parseInt(s, 10));
        const [additionStartLine, noOfLinesAdded = 1] = notNull(d[4])
            .split(",")
            .map(s => parseInt(s, 10));
        if (noOfLinesRemoved > 0) {
            lineChangeData.removals.push({
                start: notNull(removalStartLine),
                noOfLines: noOfLinesRemoved
            });
        }
        if (noOfLinesAdded > 0) {
            lineChangeData.additions.push({
                start: notNull(additionStartLine),
                noOfLines: noOfLinesAdded
            });
        }
    });
    return lineChangeData;
}

function findCharacterIndexOfLine(
    fileContents: string,
    startCharIndex: number,
    lineCount: number
): number {
    let charIndex = startCharIndex;
    let lineIndex = 0;
    while (lineIndex < lineCount && charIndex < fileContents.length) {
        const char = fileContents[charIndex];
        const nextChar = fileContents[charIndex + 1];
        if (char === "\n" || char === "\r") {
            ++lineIndex;
            if (char === "\r" && nextChar === "\n") {
                ++charIndex; // skip next character
            }
        }
        ++charIndex;
    }
    return charIndex;
}

export function calculateCharacterRangesFromLineChanges(
    lineChangeData: LineChangeData,
    fileContents: string
): CharacterRange[] {
    let charIndex = 0;
    let lineIndex = 0;
    return lineChangeData.additions.map(added => {
        const rangeStart = findCharacterIndexOfLine(
            fileContents,
            charIndex,
            added.start - lineIndex - 1
        );
        const rangeEnd = findCharacterIndexOfLine(fileContents, rangeStart, added.noOfLines);
        charIndex = rangeEnd;
        lineIndex = added.start + added.noOfLines - 1;
        return {rangeStart, rangeEnd};
    });
}

export async function runCommand(
    command: string,
    args: readonly string[],
    workingDirectory = process.cwd()
): Promise<ExecaReturnValue> {
    return execa(command, args, {cwd: workingDirectory});
}

export function generateFilesWhitelistPredicate(
    filesWhitelist: string[] | null
): (file: string) => boolean {
    if (filesWhitelist == null) {
        return () => true;
    }
    return file => filesWhitelist.includes(file);
}
