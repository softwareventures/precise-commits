import {sep} from "path";
import * as tempy from "tempy";
import {mkdirp} from "mkdirp";
import {runCommand} from "../src/utils";
import {
    getDiffForFile,
    resolveGitWorkingTreePath,
    getModifiedFilenames,
    index
} from "../src/git-utils";
import {TestBed, readFixtures} from "./test-utils";

const fixtures = readFixtures();
let testBed: TestBed;

describe("git-utils", () => {
    describe("resolveGitWorkingTreePath()", () => {
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
                /**
                 * The tmpFile should resolve to its own .git directory
                 */
                expect(await resolveGitWorkingTreePath(tmpFile.directoryPath)).toEqual(
                    tmpFile.directoryPath
                );
            });
        });

        it(`should resolve the correct working tree path in a working tree created by git worktree`, async () => {
            await tempy.directory.task(async worktreePath => {
                await runCommand("git", ["worktree", "add", "-B", "worktree", worktreePath]);
                const subdirPath = `${worktreePath}${sep}subdir`;
                await mkdirp(subdirPath);
                expect(await resolveGitWorkingTreePath(subdirPath)).toEqual(worktreePath);
                await runCommand("git", ["worktree", "remove", worktreePath]);
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
            it(fixture.fixtureName, async () => {
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = await resolveGitWorkingTreePath(tmpFile.directoryPath);
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
