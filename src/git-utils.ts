import {normalize} from "path";
import {setTimeout} from "node:timers/promises";
import {hasProperty} from "unknown";
import {notNull} from "@softwareventures/nullable";
import type {ExecaReturnValue} from "execa";
import execa = require("execa");

export interface GitOptions {
    readonly arguments: readonly string[];
    readonly workingDirectory: string;
    readonly input?: string | undefined;
    readonly stripFinalNewline?: boolean | undefined;
}

export async function git(options: GitOptions): Promise<ExecaReturnValue> {
    for (let retry = 0; ; ++retry) {
        const result = await execa("git", options.arguments, {
            cwd: options.workingDirectory,
            reject: false,
            ...(options.stripFinalNewline == null
                ? {}
                : {stripFinalNewline: options.stripFinalNewline}),
            ...(options.input == null ? {} : {input: options.input})
        });
        if (result.exitCode === 0) {
            return result;
        } else {
            if (
                retry < 14 &&
                result.exitCode === 128 &&
                /^fatal: Unable to create '.*\/\.git\/index\.lock': File exists\.$/u.exec(
                    result.stderr
                ) != null
            ) {
                await setTimeout(2 ** retry);
            } else {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw result;
            }
        }
    }
}

interface DiffIndexFile {
    diffFilterChar: string;
    filename: string;
}

export async function resolveGitWorkingTreePath(workingDirectory: string): Promise<string> {
    return git({arguments: ["rev-parse", "--show-toplevel"], workingDirectory})
        .then(({stdout}) => stdout)
        .then(normalize);
}

export const index = Symbol("index");
export const workingTree = Symbol("working-tree");

export async function getDiffForFile(
    gitDirectoryParent: string,
    fullPath: string,
    base: string | null,
    head: string | typeof index | typeof workingTree
): Promise<string> {
    if (head === index) {
        if (base == null) {
            return (
                await git({
                    arguments: ["diff", "--unified=0", "--cached", "--", fullPath],
                    workingDirectory: gitDirectoryParent
                })
            ).stdout;
        } else {
            return (
                await git({
                    arguments: ["diff", "--unified=0", "--cached", base, "--", fullPath],
                    workingDirectory: gitDirectoryParent
                })
            ).stdout;
        }
    } else if (head === workingTree) {
        if (base == null) {
            try {
                return (
                    await git({
                        arguments: ["diff", "--unified=0", "HEAD", "--", fullPath],
                        workingDirectory: gitDirectoryParent
                    })
                ).stdout;
            } catch (err: unknown) {
                //If there has never been a commit before, there will be no HEAD to compare
                // to. Use the special empty tree hash value instead:
                // https://stackoverflow.com/questions/9765453/is-gits-semi-secret-empty-tree-object-reliable-and-why-is-there-not-a-symbolic
                if (
                    hasProperty(err, "message") &&
                    typeof err.message === "string" &&
                    err.message.includes("fatal: bad revision")
                ) {
                    return git({
                        arguments: [
                            "diff",
                            "--unified=0",
                            specialEmptyTreeCommitHash,
                            "--",
                            fullPath
                        ],
                        workingDirectory: gitDirectoryParent
                    }).then(result => result.stdout);
                } else {
                    throw err;
                }
            }
        } else {
            return (
                await git({
                    arguments: ["diff", "--unified=0", base, "--", fullPath],
                    workingDirectory: gitDirectoryParent
                })
            ).stdout;
        }
    } else if (base == null) {
        throw new Error("Invalid argument");
    } else {
        return (
            await git({
                arguments: ["diff", "--unified=0", base, head, fullPath],
                workingDirectory: gitDirectoryParent
            })
        ).stdout;
    }
}

// Output of `git diff-index --help`:
//
// --diff-filter=[(A|C|D|M|R|T|U|X|B)...[*]]
//    Select only files that are Added (A), Copied (C), Deleted (D), Modified (M), Renamed (R), have
//    their type (i.e. regular file, symlink, submodule, ...) changed (T), are Unmerged (U), are
//    Unknown (X), or have had their pairing Broken (B). Any combination of the filter characters
//    (including none) can be used. When * (All-or-none) is added to the combination, all paths are
//    selected if there is any file that matches other criteria in the comparison; if there is no
//    file that matches other criteria, nothing is selected.
//
//    Also, these upper-case letters can be downcased to exclude. E.g.  --diff-filter=ad excludes
//    added and deleted paths.
//
// We check files that have been added or modified.
const diffIndexFilter = "AM";
const specialEmptyTreeCommitHash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export async function getModifiedFilenames(
    gitDirectoryParent: string,
    base: string | null,
    head: string | null
): Promise<string[]> {
    let diffIndexOutput: string;
    if (base != null && head != null) {
        // We are grabbing the files between the two given commit SHAs
        diffIndexOutput = (
            await git({
                arguments: [
                    "diff",
                    "--name-status",
                    `--diff-filter=${diffIndexFilter}`,
                    base,
                    head
                ],
                workingDirectory: gitDirectoryParent
            })
        ).stdout;
    } else {
        // No commit SHAs given, we assume we are attempting to evaluate staged files,
        // and so need to determine if there is HEAD SHA available.
        let head: string = "";
        try {
            head = (
                await git({
                    arguments: ["rev-parse", "--verify", "HEAD"],
                    workingDirectory: gitDirectoryParent
                })
            ).stdout.replace("\n", "");
        } catch (err) {
            // If there has never been a commit before, there will be no HEAD to compare
            // to. Use the special empty tree hash value instead:
            // https://stackoverflow.com/questions/9765453/is-gits-semi-secret-empty-tree-object-reliable-and-why-is-there-not-a-symbolic
            if (
                hasProperty(err, "message") &&
                typeof err.message === "string" &&
                err.message.includes("fatal: Needed a single revision")
            ) {
                head = specialEmptyTreeCommitHash;
            } else {
                throw err;
            }
        }
        diffIndexOutput = (
            await git({
                arguments: [
                    "diff-index",
                    "--cached",
                    "--name-status",
                    `--diff-filter=${diffIndexFilter}`,
                    head
                ],
                workingDirectory: gitDirectoryParent
            })
        ).stdout;
    }
    const allFiles = parseDiffIndexOutput(diffIndexOutput);
    return allFiles.map(r => r.filename);
}

function parseDiffIndexOutput(stdout: string): DiffIndexFile[] {
    const lines = stdout.split("\n");
    return lines.filter(Boolean).map(line => {
        const parts = line.split("\t");
        return {
            filename: notNull(parts[1]),
            diffFilterChar: notNull(parts[0])
        };
    });
}
