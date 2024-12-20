import {getDiffForFile, index, resolveGitWorkingTreePath} from "../src/git-utils";
import {extractLineChangeData, calculateCharacterRangesFromLineChanges} from "../src/utils";
import {TestBed, readFixtures} from "./test-utils";

const fixtures = readFixtures();
let testBed: TestBed;

interface LineSeparator {
    name: string;
    convert: (text: string) => string;
}

const lf: LineSeparator = {
    name: "LF",
    convert: text => text.replace(/\r?\n|\r/gu, "\n")
};

const crlf: LineSeparator = {
    name: "CRLF",
    convert: text => text.replace(/\r?\n|\r/gu, "\r\n")
};

const cr: LineSeparator = {
    name: "CR",
    convert: text => text.replace(/\r?\n|\r/gu, "\r")
};

describe("utils", () => {
    describe("extractLineChangeData()", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        afterAll(async () => {
            await testBed.teardown();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = await resolveGitWorkingTreePath(tmpFile.directoryPath);
                const diff = await getDiffForFile(
                    gitDirectoryParent,
                    tmpFile.path,
                    tmpFile.initialCommitSHA,
                    tmpFile.updatedCommitSHA ?? index
                );
                const lineChangeData = extractLineChangeData(diff);
                expect(lineChangeData).toMatchSnapshot();
            });
        });
    });

    describe("calculateCharacterRangesFromLineChanges()", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        afterAll(async () => {
            await testBed.teardown();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = await resolveGitWorkingTreePath(tmpFile.directoryPath);
                const diff = await getDiffForFile(
                    gitDirectoryParent,
                    tmpFile.path,
                    tmpFile.initialCommitSHA,
                    tmpFile.updatedCommitSHA ?? index
                );
                const lineChangeData = extractLineChangeData(diff);
                [lf, crlf, cr].forEach(lineSeparator => {
                    const characterRanges = calculateCharacterRangesFromLineChanges(
                        lineChangeData,
                        lineSeparator.convert(fixture.stagedContents)
                    );
                    expect(characterRanges).toMatchSnapshot();
                });
            });
        });
    });
});
