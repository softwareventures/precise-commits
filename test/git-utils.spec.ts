import {sep} from "path";
import * as tempy from "tempy";
import {mkdirp} from "mkdirp";
import {
    getDiffForFile,
    resolveGitWorkingTreePath,
    getModifiedFilenames,
    index,
    git
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
            await tempy.directory.task(async repositoryPath => {
                await git({arguments: ["init"], workingDirectory: repositoryPath});
                await git({
                    arguments: ["commit", "--allow-empty", "-m", "initial commit"],
                    workingDirectory: repositoryPath
                });
                await tempy.directory.task(async worktreePath => {
                    await git({
                        arguments: ["worktree", "add", "-B", "worktree", worktreePath],
                        workingDirectory: repositoryPath
                    });
                    const subdirPath = `${worktreePath}${sep}subdir`;
                    await mkdirp(subdirPath);
                    expect(await resolveGitWorkingTreePath(subdirPath)).toEqual(worktreePath);
                    await git({
                        arguments: ["worktree", "remove", worktreePath],
                        workingDirectory: repositoryPath
                    });
                });
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
