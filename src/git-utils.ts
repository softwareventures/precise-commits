import {dirname} from "path";
import {hasProperty} from "unknown";
import {notNull} from "@softwareventures/nullable";
import findUp = require("find-up");
import {runCommandSync} from "./utils";

interface DiffIndexFile {
    diffFilterChar: string;
    filename: string;
}

export async function resolveNearestGitDirectoryParent(workingDirectory: string): Promise<string> {
    const gitDirectoryPath = await findUp(".git", {cwd: workingDirectory, type: "directory"});
    if (gitDirectoryPath == null) {
        throw new Error("No .git directory found");
    }
    return dirname(gitDirectoryPath);
}

export const index = Symbol("index");
export const workingTree = Symbol("working-tree");

export function getDiffForFile(
    gitDirectoryParent: string,
    fullPath: string,
    base: string | null,
    head: string | typeof index | typeof workingTree
): string {
    if (head === index) {
        if (base == null) {
            return runCommandSync(
                "git",
                ["diff", "--unified=0", "--cached", "--", fullPath],
                gitDirectoryParent
            ).stdout;
        } else {
            return runCommandSync(
                "git",
                ["diff", "--unified=0", "--cached", base, "--", fullPath],
                gitDirectoryParent
            ).stdout;
        }
    } else if (head === workingTree) {
        if (base == null) {
            try {
                return runCommandSync(
                    "git",
                    ["diff", "--unified=0", "HEAD", "--", fullPath],
                    gitDirectoryParent
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
                    return runCommandSync(
                        "git",
                        ["diff", "--unified=0", specialEmptyTreeCommitHash, "--", fullPath],
                        gitDirectoryParent
                    ).stdout;
                } else {
                    throw err;
                }
            }
        } else {
            return runCommandSync(
                "git",
                ["diff", "--unified=0", base, "--", fullPath],
                gitDirectoryParent
            ).stdout;
        }
    } else if (base == null) {
        throw new Error("Invalid argument");
    } else {
        return runCommandSync(
            "git",
            ["diff", "--unified=0", base, head, fullPath],
            gitDirectoryParent
        ).stdout;
    }
}

/**
 * Output of `git diff-index --help`:
 *
 * --diff-filter=[(A|C|D|M|R|T|U|X|B)...[*]]
      Select only files that are Added (A), Copied (C), Deleted (D), Modified (M), Renamed (R), have
      their type (i.e. regular file, symlink, submodule, ...) changed (T), are Unmerged (U), are
      Unknown (X), or have had their pairing Broken (B). Any combination of the filter characters
      (including none) can be used. When * (All-or-none) is added to the combination, all paths are
      selected if there is any file that matches other criteria in the comparison; if there is no
      file that matches other criteria, nothing is selected.

      Also, these upper-case letters can be downcased to exclude. E.g.  --diff-filter=ad excludes
      added and deleted paths.
 *
 */
/**
 * const diffIndexFilter = 'ACDMRTUXB';
 * NOTE: We are only explicitly testing "Modified" and "Added" files for now...
 */
const diffIndexFilter = "AM";
const specialEmptyTreeCommitHash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function getModifiedFilenames(
    gitDirectoryParent: string,
    base: string | null,
    head: string | null
): string[] {
    let diffIndexOutput: string;
    if (base != null && head != null) {
        /**
         * We are grabbing the files between the two given commit SHAs
         */
        diffIndexOutput = runCommandSync(
            "git",
            ["diff", "--name-status", `--diff-filter=${diffIndexFilter}`, base, head],
            gitDirectoryParent
        ).stdout;
    } else {
        /**
         * No commit SHAs given, we assume we are attempting to evaluate staged files,
         * and so need to determine if there is HEAD SHA available.
         */
        let head: string = "";
        try {
            head = runCommandSync(
                "git",
                ["rev-parse", "--verify", "HEAD"],
                gitDirectoryParent
            ).stdout.replace("\n", "");
        } catch (err) {
            /**
             * If there has never been a commit before, there will be no HEAD to compare
             * to. Use the special empty tree hash value instead:
             * https://stackoverflow.com/questions/9765453/is-gits-semi-secret-empty-tree-object-reliable-and-why-is-there-not-a-symbolic
             */
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
        diffIndexOutput = runCommandSync(
            "git",
            ["diff-index", "--cached", "--name-status", `--diff-filter=${diffIndexFilter}`, head],
            gitDirectoryParent
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
