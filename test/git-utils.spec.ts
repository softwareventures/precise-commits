import {join} from "path";
import {
    getDiffForFile,
    resolveNearestGitDirectoryParent,
    getModifiedFilenames,
    index
} from "../src/git-utils";
import {TestBed, readFixtures} from "./test-utils";

const fixtures = readFixtures();
let testBed: TestBed;

describe("git-utils", () => {
    describe("resolveNearestGitDirectoryParent()", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                /**
                 * The tmpFile should resolve to its own .git directory
                 */
                expect(await resolveNearestGitDirectoryParent(tmpFile.directoryPath)).toEqual(
                    tmpFile.directoryPath
                );
            });
        });

        it(`should resolve the overall project's .git directory for this spec file`, async () => {
            expect(await resolveNearestGitDirectoryParent(__dirname)).toEqual(
                join(__dirname, "..")
            );
        });
    });

    describe("getDiffForFile()", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = await resolveNearestGitDirectoryParent(
                    tmpFile.directoryPath
                );
                const diff = await getDiffForFile(
                    gitDirectoryParent,
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

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = await resolveNearestGitDirectoryParent(
                    tmpFile.directoryPath
                );
                const fileNames = await getModifiedFilenames(
                    gitDirectoryParent,
                    tmpFile.initialCommitSHA,
                    tmpFile.updatedCommitSHA
                );
                expect(fileNames).toEqual([`${tmpFile.filename}`]);
            });
        });
    });
});
