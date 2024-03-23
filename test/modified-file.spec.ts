import {ModifiedFile} from "../src/modified-file";
import {preciseFormatterPrettier} from "../src/precise-formatters/prettier";
import {resolveNearestGitDirectoryParent, workingTree} from "../src/git-utils";
import {TestBed, readFixtures} from "./test-utils";

const fixtures = readFixtures();
let testBed: TestBed;

describe("ModifiedFile", () => {
    describe("isAlreadyFormatted()", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = await resolveNearestGitDirectoryParent(
                    tmpFile.directoryPath
                );
                const modifiedFile = new ModifiedFile({
                    fullPath: tmpFile.path,
                    gitDirectoryParent,
                    base: tmpFile.initialCommitSHA,
                    head: tmpFile.updatedCommitSHA ?? workingTree,
                    selectedFormatter: preciseFormatterPrettier
                });
                expect(modifiedFile.isAlreadyFormatted()).toEqual(false);
            });
        });
    });
});
