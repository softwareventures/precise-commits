import {TestBed, readFixtures} from "./test-utils";

import {ModifiedFile} from "../src/modified-file";
import {preciseFormatterPrettier} from "../src/precise-formatters/prettier";
import {resolveGitWorkingTreePath, workingTree} from "../src/git-utils";

const fixtures = readFixtures();
let testBed: TestBed;

describe("ModifiedFile", () => {
    describe("isAlreadyFormatted()", function () {
        beforeAll(() => {
            testBed = new TestBed();
        });

        afterAll(async () => {
            await testBed.teardown();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, () => {
                testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = resolveGitWorkingTreePath(tmpFile.directoryPath);
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
