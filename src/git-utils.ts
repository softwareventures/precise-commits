import {normalize} from "path";
import {hasProperty} from "unknown";
import {notNull} from "@softwareventures/nullable";
import {runCommand} from "./utils";

interface DiffIndexFile {
    diffFilterChar: string;
    filename: string;
}

export async function resolveGitWorkingTreePath(workingDirectory: string): Promise<string> {
    return runCommand("git", ["rev-parse", "--show-toplevel"], workingDirectory)
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
                await runCommand(
                    "git",
                    ["diff", "--unified=0", "--cached", "--", fullPath],
                    gitDirectoryParent
                )
            ).stdout;
        } else {
            return (
                await runCommand(
                    "git",
                    ["diff", "--unified=0", "--cached", base, "--", fullPath],
                    gitDirectoryParent
                )
            ).stdout;
        }
    } else if (head === workingTree) {
        if (base == null) {
            try {
                return (
                    await runCommand(
                        "git",
                        ["diff", "--unified=0", "HEAD", "--", fullPath],
                        gitDirectoryParent
                    )
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
                    return runCommand(
                        "git",
                        ["diff", "--unified=0", specialEmptyTreeCommitHash, "--", fullPath],
                        gitDirectoryParent
                    ).then(result => result.stdout);
                } else {
                    throw err;
                }
            }
        } else {
            return (
                await runCommand(
                    "git",
                    ["diff", "--unified=0", base, "--", fullPath],
                    gitDirectoryParent
                )
            ).stdout;
        }
    } else if (base == null) {
        throw new Error("Invalid argument");
    } else {
        return (
            await runCommand(
                "git",
                ["diff", "--unified=0", base, head, fullPath],
                gitDirectoryParent
            )
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
            await runCommand(
                "git",
                ["diff", "--name-status", `--diff-filter=${diffIndexFilter}`, base, head],
                gitDirectoryParent
            )
        ).stdout;
    } else {
        // No commit SHAs given, we assume we are attempting to evaluate staged files,
        // and so need to determine if there is HEAD SHA available.
        let head: string = "";
        try {
            head = (
                await runCommand("git", ["rev-parse", "--verify", "HEAD"], gitDirectoryParent)
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
            await runCommand(
                "git",
                [
                    "diff-index",
                    "--cached",
                    "--name-status",
                    `--diff-filter=${diffIndexFilter}`,
                    head
                ],
                gitDirectoryParent
            )
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
