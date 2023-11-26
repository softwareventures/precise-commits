import {readFileSync, writeFileSync, readdirSync} from "fs";
import {extname, join} from "path";
import {randomBytes} from "crypto";
import mkdirp = require("mkdirp");
import {mapNullable, notNull} from "@softwareventures/nullable";
import {runCommandSync} from "../src/utils";
import type {AdditionalOptions} from "../lib/index";

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
    private static readonly TMP_DIRECTORY_PATH = join(process.cwd(), "tmp");
    private testBedDirectoryPath: string | null = null;
    private readonly fixtureToTmpFile = new Map<Fixture, TmpFile>();

    public constructor() {
        this.createUniqueDirectoryForTestBed();
    }

    public getTmpFileForFixture(fixture: Fixture): TmpFile {
        return notNull(this.fixtureToTmpFile.get(fixture));
    }

    public prepareFixtureInTmpDirectory(fixture: Fixture): void {
        /**
         * Create and cache a TmpFile for the given Fixture
         */
        const tmpFile = this.createTmpFileForFixture(fixture);
        this.fixtureToTmpFile.set(fixture, tmpFile);
        /**
         * Initialise a .git directory for the fixture
         */
        mkdirp.sync(tmpFile.directoryPath);
        runCommandSync("git", ["init"], tmpFile.directoryPath);
        /**
         * Apply the two different file contents to the TmpFile
         */
        this.applyInitialAndStagedContentsOnDisk(tmpFile);
        /**
         * Apply any custom prettier config if present
         */
        this.applyCustomPrettierConfig(tmpFile, fixture.customPrettierConfig);
    }

    private createUniqueDirectoryForTestBed(): void {
        const dir = this.generateUniqueDirectoryName();
        this.testBedDirectoryPath = join(TestBed.TMP_DIRECTORY_PATH, dir);
        mkdirp.sync(this.testBedDirectoryPath);
    }

    private generateUniqueDirectoryName(): string {
        return randomBytes(20).toString("hex");
    }

    private applyInitialAndStagedContentsOnDisk(tmpFile: TmpFile): void {
        /**
         * If we editing an existing `initial` file, we need to first create
         * it and commit it
         */
        if (tmpFile.initialContents != null) {
            this.createAndCommitTmpFileOnDisk(tmpFile);
        }
        this.stageGivenChangesToTmpFileOnDisk(tmpFile);
        if (tmpFile.committed) {
            runCommandSync(
                "git",
                ["commit", "-m", `committing updates to ${tmpFile.path}]`],
                tmpFile.directoryPath
            );
            tmpFile.updatedCommitSHA = runCommandSync(
                "git",
                ["rev-parse", "HEAD"],
                tmpFile.directoryPath
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

    private createAndCommitTmpFileOnDisk(tmpFile: TmpFile): void {
        writeFileSync(tmpFile.path, notNull(tmpFile.initialContents));
        runCommandSync("git", ["add", tmpFile.path], tmpFile.directoryPath);
        runCommandSync(
            "git",
            ["commit", "-m", `adding initial contents for ${tmpFile.path}`],
            tmpFile.directoryPath
        );
        if (tmpFile.committed) {
            tmpFile.initialCommitSHA = runCommandSync(
                "git",
                ["rev-parse", "HEAD"],
                tmpFile.directoryPath
            ).stdout.trim();
        }
    }

    private stageGivenChangesToTmpFileOnDisk(tmpFile: TmpFile): void {
        writeFileSync(tmpFile.path, tmpFile.stagedContents);
        runCommandSync("git", ["add", tmpFile.path], tmpFile.directoryPath);
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
