#!/usr/bin/env node

import {normalize} from "path";
import ora = require("ora");
import mri = require("mri");
import glob = require("glob");
import {main} from ".";
import {notNull} from "@softwareventures/nullable";
import {hasProperty} from "unknown";
import {concatMap, isArray} from "@softwareventures/array";

const LIBRARY_NAME = "precise-commits";
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
    if (!filesWhitelist || !filesWhitelist.length) {
        console.error(
            `Error: No files match the glob pattern(s) you provided for --whitelist -> "${config.whitelist}"`
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

const primarySpinner = ora(` Running ${LIBRARY_NAME}...`);
const modifiedFilesSpinner = ora(" Detecting modified files from git...");
const spinnersByFilename = new Map<string, ora.Ora>();

let shouldErrorOut = false;

main(process.cwd(), options).subscribe({
    next: event => {
        if (event.event === "Init") {
            primarySpinner.start();
            modifiedFilesSpinner.start();
        } else if (event.event === "ModifiedFilesDetected") {
            if (event.modifiedFiles.length > 0) {
                modifiedFilesSpinner.succeed(
                    ` ${LIBRARY_NAME}: ${event.modifiedFiles.length} modified file(s) found`
                );
            }
        } else if (event.event === "BegunProcessingFile") {
            spinnersByFilename.set(
                event.filename,
                ora()
                    .start()
                    .succeed(
                        ` [${event.index + 1}/${event.totalFiles}] Processing file: ${
                            event.filename
                        }`
                    )
            );
        } else if (event.event === "FinishedProcessingFile") {
            const spinner = spinnersByFilename.get(event.filename);
            switch (event.status) {
                case "UPDATED":
                    notNull(spinner).succeed(`       --> Updated formatting in: ${event.filename}`);
                    break;
                case "NOT_UPDATED":
                    notNull(spinner).info(
                        `       --> No formatting changes required in: ${event.filename}`
                    );
                    break;
                case "INVALID_FORMATTING":
                    // If --check-only is passed as a CLI argument, the script will error out.
                    if (options.checkOnly) {
                        shouldErrorOut = true;
                    }
                    notNull(spinner).fail(
                        `       --> Invalid formatting detected in: ${event.filename}`
                    );
                    break;
            }
        } else if (event.event === "Complete") {
            if (event.totalFiles === 0) {
                modifiedFilesSpinner.info(` ${LIBRARY_NAME}: No matching modified files detected.
        
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
        modifiedFilesSpinner.fail(` ${LIBRARY_NAME}: An Error occurred\n`);
        console.error(error);
        console.log("\n");
        primarySpinner.stop();
        return process.exit(1);
    }
});
