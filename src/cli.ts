#!/usr/bin/env node

import {normalize} from "path";
import ora = require("ora");
import mri = require("mri");
import glob = require("glob");
import {hasProperty} from "unknown";
import {concatMap, isArray} from "@softwareventures/array";
import {pairwise} from "rxjs";
import {main} from ".";

const libraryName = "precise-commits";
const config = mri<unknown>(process.argv.slice(2));

/**
 * If the user provided one or more glob patterns to match against, ensure that there are
 * applicable files available
 */
let filesWhitelist: string[] | null = null;
if (hasProperty(config, "whitelist")) {
    if (isArray(config.whitelist)) {
        filesWhitelist = concatMap(config.whitelist, entry => glob.sync(String(entry)));
    } else {
        filesWhitelist = glob.sync(String(config.whitelist));
    }
    if ((filesWhitelist?.length ?? 0) === 0) {
        console.error(
            `Error: No files match the glob pattern(s) you provided for --whitelist -> "${String(
                config.whitelist
            )}"`
        );
        process.exit(1);
    }
    filesWhitelist = filesWhitelist.map(normalize);
}

/**
 * If the user specifies at least one SHA, perform some validation and
 * apply some defaults
 */
let base: string | null = null;
let head: string | null = null;
if (hasProperty(config, "base") || hasProperty(config, "head")) {
    if (!hasProperty(config, "base") || config.base == null) {
        console.error(
            `Error: When giving a value of --head, you must also give a value for --base`
        );
        process.exit(1);
    }

    if (hasProperty(config, "head") && config.head != null) {
        // FIXME: Tech debt
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        head = String(config.head);
    } else {
        /**
         * If the user only specified `--base`, set the value of `--head` to be "HEAD"
         */
        head = "HEAD";
    }

    // FIXME: Tech debt
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    base = String(config.base);
}

const checkOnly = hasProperty(config, "check-only") ? Boolean(config["check-only"]) : false;
const formatter = hasProperty(config, "formatter")
    ? // FIXME: Tech debt
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      String(config.formatter ?? "prettier")
    : "prettier";

const options = {
    checkOnly,
    filesWhitelist,
    base,
    head,
    formatter
};

const spinner = ora(`Running ${libraryName}`);

let shouldErrorOut = false;

main(process.cwd(), options)
    .pipe(pairwise())
    .subscribe({
        next: ([previous, current]) => {
            if (current.state === "Running") {
                if (previous.state === "Initializing") {
                    spinner.start(`Running ${libraryName}`);
                }

                if (current.files.length > 0) {
                    spinner.text = `${libraryName}: ${current.files.length} modified file(s) found`;
                }

                current.files.forEach((fileState, index) => {
                    const previousFileState =
                        previous.state === "Running" ? previous.files[index] : undefined;

                    if (previousFileState == null) {
                        spinner.info(`Processing file: ${fileState.filename}`);
                    }

                    if (previousFileState?.status !== fileState.status) {
                        if (fileState.status === "Updated") {
                            spinner.succeed(`Updated formatting in: ${fileState.filename}`);
                        } else if (fileState.status === "NotUpdated") {
                            spinner.succeed(
                                `No formatting changes required in: ${fileState.filename}`
                            );
                        } else if (fileState.status === "InvalidFormatting") {
                            // If --check-only is passed as a CLI argument, the script will error out.
                            if (options.checkOnly) {
                                shouldErrorOut = true;
                            }

                            spinner.fail(`Invalid formatting detected in: ${fileState.filename}`);
                        }
                    }
                });
            } else if (current.state === "Finished") {
                if (current.fileCount === 0) {
                    spinner.info("No matching modified files detected.");
                    spinner.info(
                        "If you feel that one or more files should be showing up here, be sure to first check what file extensions prettier supports, and whether or not you have included those files in a .prettierignore file"
                    );
                    spinner.stop();
                } else if (options.checkOnly) {
                    spinner.succeed("Checks complete 🎉");
                } else {
                    spinner.succeed("Formatting complete 🎉");
                }
                return process.exit(shouldErrorOut ? 1 : 0);
            }
        },
        error: (error: unknown) => {
            spinner.fail("An Error occurred");
            console.error("\n");
            console.error(error);
            console.error("\n");
            spinner.stop();
            return process.exit(1);
        }
    });
