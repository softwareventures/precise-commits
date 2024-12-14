import {sep} from "path";
import * as tempy from "tempy";
import {mkdirp} from "mkdirp";
import {runCommandSync} from "../src/utils";
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
            it(fixture.fixtureName, () => {
                testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                /**
                 * The tmpFile should resolve to its own .git directory
                 */
                expect(resolveGitWorkingTreePath(tmpFile.directoryPath)).toEqual(
                    tmpFile.directoryPath
                );
            });
        });

        it(`should resolve the correct working tree path in a working tree created by git worktree`, async () => {
            await tempy.directory.task(async worktreePath => {
                runCommandSync("git", ["worktree", "add", "-B", "worktree", worktreePath]);
                const subdirPath = `${worktreePath}${sep}subdir`;
                await mkdirp(subdirPath);
                expect(resolveGitWorkingTreePath(subdirPath)).toEqual(worktreePath);
                runCommandSync("git", ["worktree", "remove", worktreePath]);
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
                const gitDirectoryParent = resolveGitWorkingTreePath(tmpFile.directoryPath);
                const diff = getDiffForFile(
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
            it(fixture.fixtureName, () => {
                testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const gitDirectoryParent = resolveGitWorkingTreePath(tmpFile.directoryPath);
                const fileNames = getModifiedFilenames(
                    gitDirectoryParent,
                    tmpFile.initialCommitSHA,
                    tmpFile.updatedCommitSHA
                );
                expect(fileNames).toEqual([`${tmpFile.filename}`]);
            });
        });
    });
});
