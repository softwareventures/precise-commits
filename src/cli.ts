#!/usr/bin/env node

import {normalize} from "path";
import ora = require("ora");
import mri = require("mri");
import glob = require("glob");
import {notNull} from "@softwareventures/nullable";
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
        head = String(config.head);
    } else {
        /**
         * If the user only specified `--base`, set the value of `--head` to be "HEAD"
         */
        head = "HEAD";
    }

    base = String(config.base);
}

const checkOnly = hasProperty(config, "check-only") ? Boolean(config["check-only"]) : false;
const formatter = hasProperty(config, "formatter")
    ? String(config.formatter ?? "prettier")
    : "prettier";

const options = {
    checkOnly,
    filesWhitelist,
    base,
    head,
    formatter
};

const primarySpinner = ora(` Running ${libraryName}...`);
const modifiedFilesSpinner = ora(" Detecting modified files from git...");
const fileSpinners: ora.Ora[] = [];

let shouldErrorOut = false;

main(process.cwd(), options)
    .pipe(pairwise())
    .subscribe({
        next: ([previous, current]) => {
            if (current.state === "Running") {
                if (previous.state === "Initializing") {
                    primarySpinner.start();
                    modifiedFilesSpinner.start();
                }

                modifiedFilesSpinner.text = ` ${libraryName}: ${current.files.length} modified file(s) found`;
                if (current.gitSearchComplete) {
                    modifiedFilesSpinner.succeed();
                }

                current.files.forEach((fileState, index) => {
                    if (index > fileSpinners.length) {
                        fileSpinners.push(
                            ora().start(
                                ` [${index + 1}/${current.files.length}] Processing file: ${
                                    fileState.filename
                                }`
                            )
                        );
                    }

                    if (fileState.status === "Updated") {
                        notNull(fileSpinners[index]).succeed(
                            `       --> Updated formatting in: ${fileState.filename}`
                        );
                    } else if (fileState.status === "NotUpdated") {
                        notNull(fileSpinners[index]).info(
                            `       --> No formatting changes required in: ${fileState.filename}`
                        );
                    } else if (fileState.status === "InvalidFormatting") {
                        // If --check-only is passed as a CLI argument, the script will error out.
                        if (options.checkOnly) {
                            shouldErrorOut = true;
                        }

                        notNull(fileSpinners[index]).fail(
                            `       --> Invalid formatting detected in: ${fileState.filename}`
                        );
                    }
                });
            } else if (current.state === "Finished") {
                if (current.fileCount === 0) {
                    modifiedFilesSpinner.info(` ${libraryName}: No matching modified files detected.

  --> If you feel that one or more files should be showing up here, be sure to first check what file extensions prettier supports, and whether or not you have included those files in a .prettierignore file

            `);
                    primarySpinner.stop();
                } else if (options.checkOnly) {
                    primarySpinner.succeed(" Checks complete 🎉");
                } else {
                    primarySpinner.succeed(" Formatting complete 🎉");
                }
                return process.exit(shouldErrorOut ? 1 : 0);
            }
        },
        error: (error: unknown) => {
            modifiedFilesSpinner.fail(` ${libraryName}: An Error occurred\n`);
            console.error(error);
            console.log("\n");
            primarySpinner.stop();
            return process.exit(1);
        }
    });
