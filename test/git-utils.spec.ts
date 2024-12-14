import {TestBed, readFixtures} from "./test-utils";
import {
    getDiffForFile,
    resolveNearestGitDirectoryParent,
    getModifiedFilenames,
    index
} from "../src/git-utils";

const fixtures = readFixtures();
let testBed: TestBed;

describe("git-utils", () => {
    describe("resolveNearestGitDirectoryParent()", () => {
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
                /**
                 * The tmpFile should resolve to its own .git directory
                 */
                expect(resolveNearestGitDirectoryParent(tmpFile.directoryPath)).toEqual(
                    tmpFile.directoryPath
                );
            });
        });
    });

    describe("getDiffForFile()", () => {
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
                const diff = getDiffForFile(
                    resolveNearestGitDirectoryParent(tmpFile.directoryPath),
                    tmpFile.path,
                    tmpFile.initialCommitSHA,
                    tmpFile.updatedCommitSHA ?? index
                );
                expect(diff).toMatchSnapshot();
            });
        });
    });

    describe("getModifiedFilenames()", () => {
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
                const fileNames = getModifiedFilenames(
                    resolveNearestGitDirectoryParent(tmpFile.directoryPath),
                    tmpFile.initialCommitSHA,
                    tmpFile.updatedCommitSHA
                );
                expect(fileNames).toEqual([`${tmpFile.filename}`]);
            });
        });
    });
});
