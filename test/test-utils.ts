import {readFileSync, writeFileSync, readdirSync} from "fs";
import {extname, join} from "path";
import {writeFile} from "fs/promises";
import mkdirp = require("mkdirp");
import {mapNullable, notNull} from "@softwareventures/nullable";
import * as tempy from "tempy";
import {rimraf} from "rimraf";
import {runCommand} from "../src/utils";
import type {AdditionalOptions} from "../src";

export interface Fixture {
    fixtureName: string;
    fileExtension: string;
    /**
     * Optional, there will not be an `initial` file if we are testing
     * a brand new file in the git index
     */
    initialContents: string | null;
    /**
     * The file as it stands after `git add`, but before formatting
     */
    stagedContents: string;
    committed: boolean;
    /**
     * Optional prettier config overrides specified inline in the
     * fixture directory
     */
    customPrettierConfig: CustomPrettierConfig | null;
}

interface CustomPrettierConfig {
    filename: string;
    contents: string;
}

interface TmpFile {
    name: string;
    filename: string;
    directoryPath: string;
    initialContents: string | null;
    stagedContents: string;
    committed: boolean;
    initialCommitSHA: string | null;
    updatedCommitSHA: string | null;
    path: string;
}

export class TestBed {
    private readonly testBedDirectoryPath: string = tempy.directory();
    private readonly fixtureToTmpFile = new Map<Fixture, TmpFile>();

    public getTmpFileForFixture(fixture: Fixture): TmpFile {
        return notNull(this.fixtureToTmpFile.get(fixture));
    }

    public async prepareFixtureInTmpDirectory(fixture: Fixture): Promise<void> {
        /**
         * Create and cache a TmpFile for the given Fixture
         */
        const tmpFile = this.createTmpFileForFixture(fixture);
        this.fixtureToTmpFile.set(fixture, tmpFile);
        /**
         * Initialise a .git directory for the fixture
         */
        mkdirp.sync(tmpFile.directoryPath);
        await runCommand("git", ["init"], tmpFile.directoryPath);
        /**
         * Apply the two different file contents to the TmpFile
         */
        await this.applyInitialAndStagedContentsOnDisk(tmpFile);
        /**
         * Apply any custom prettier config if present
         */
        this.applyCustomPrettierConfig(tmpFile, fixture.customPrettierConfig);
    }

    public async teardown(): Promise<void> {
        await rimraf(this.testBedDirectoryPath);
    }

    private async applyInitialAndStagedContentsOnDisk(tmpFile: TmpFile): Promise<void> {
        /**
         * If we editing an existing `initial` file, we need to first create
         * it and commit it
         */
        if (tmpFile.initialContents != null) {
            await this.createAndCommitTmpFileOnDisk(tmpFile);
        }
        await this.stageGivenChangesToTmpFileOnDisk(tmpFile);
        if (tmpFile.committed) {
            await runCommand(
                "git",
                ["commit", "-m", `committing updates to ${tmpFile.path}]`],
                tmpFile.directoryPath
            );
            // eslint-disable-next-line require-atomic-updates
            tmpFile.updatedCommitSHA = (
                await runCommand("git", ["rev-parse", "HEAD"], tmpFile.directoryPath)
            ).stdout.trim();
        }
    }

    private createTmpFileForFixture(fixture: Fixture): TmpFile {
        const name = fixture.fixtureName;
        const filename = `${name}${fixture.fileExtension}`;
        const directoryPath = join(notNull(this.testBedDirectoryPath), name);
        return {
            name,
            filename,
            directoryPath,
            path: join(directoryPath, filename),
            initialContents: fixture.initialContents,
            stagedContents: fixture.stagedContents,
            committed: fixture.committed,
            initialCommitSHA: null,
            updatedCommitSHA: null
        };
    }

    private applyCustomPrettierConfig(
        tmpFile: TmpFile,
        customPrettierConfig: CustomPrettierConfig | null
    ): void {
        if (customPrettierConfig == null) {
            return;
        }
        writeFileSync(
            join(tmpFile.directoryPath, customPrettierConfig.filename),
            customPrettierConfig.contents
        );
    }

    private async createAndCommitTmpFileOnDisk(tmpFile: TmpFile): Promise<void> {
        writeFileSync(tmpFile.path, notNull(tmpFile.initialContents));
        await runCommand("git", ["add", tmpFile.path], tmpFile.directoryPath);
        await runCommand(
            "git",
            ["commit", "-m", `adding initial contents for ${tmpFile.path}`],
            tmpFile.directoryPath
        );
        if (tmpFile.committed) {
            // eslint-disable-next-line require-atomic-updates
            tmpFile.initialCommitSHA = (
                await runCommand("git", ["rev-parse", "HEAD"], tmpFile.directoryPath)
            ).stdout.trim();
        }
    }

    private async stageGivenChangesToTmpFileOnDisk(tmpFile: TmpFile): Promise<void> {
        await writeFile(tmpFile.path, tmpFile.stagedContents);
        await runCommand("git", ["add", tmpFile.path], tmpFile.directoryPath);
    }
}

export function readFixtures(): Fixture[] {
    const fixturesDirPath = join(process.cwd(), "test", "fixtures");
    const fixtures = readdirSync(fixturesDirPath);
    return fixtures.map(name => {
        const fixtureDirPath = join(fixturesDirPath, name);
        const files = readdirSync(fixtureDirPath);
        /**
         * Could have any of the file extensions supported by prettier
         */
        const initialContentsFileName = files.find(f => Boolean(f.match(/initial/u)));
        const stagedContentsFileName = files.find(f => Boolean(f.match(/staged/u)));
        const committedContentsFileName = files.find(f => Boolean(f.match(/committed/u)));
        const prettierConfigFileName = files.find(f => Boolean(f.match(/prettierrc/u)));

        if (stagedContentsFileName == null && committedContentsFileName == null) {
            throw new Error(`"staged" or "committed" file missing for fixture: ${fixtureDirPath}`);
        }

        if (stagedContentsFileName != null && committedContentsFileName != null) {
            throw new Error(
                `"staged" and "committed" files cannot be used together - fixture: ${fixtureDirPath}`
            );
        }

        return {
            fixtureName: name,
            fileExtension: extname(notNull(stagedContentsFileName ?? committedContentsFileName)),
            initialContents: mapNullable(initialContentsFileName, filename =>
                readFileSync(join(fixtureDirPath, filename), "utf8")
            ),
            stagedContents:
                stagedContentsFileName == null
                    ? readFileSync(join(fixtureDirPath, notNull(committedContentsFileName)), "utf8")
                    : readFileSync(join(fixtureDirPath, stagedContentsFileName), "utf8"),
            committed: Boolean(committedContentsFileName),
            customPrettierConfig: mapNullable(prettierConfigFileName, filename => ({
                filename,
                contents: readFileSync(join(fixtureDirPath, filename), "utf8")
            }))
        };
    });
}

export function mergeOptionsForTmpFile(
    options: Pick<AdditionalOptions, "checkOnly" | "filesWhitelist">,
    tmpFile: TmpFile
): AdditionalOptions {
    const shaOptions = tmpFile.committed
        ? {
              base: tmpFile.initialCommitSHA,
              head: tmpFile.updatedCommitSHA
          }
        : {base: null, head: null};

    return {
        ...options,
        ...shaOptions
    };
}
