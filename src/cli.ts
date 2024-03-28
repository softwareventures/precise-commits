#!/usr/bin/env node

import {normalize} from "path";
import ora = require("ora");
import mri = require("mri");
import glob = require("glob");
import {main} from ".";
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

const spinner = ora(`Running ${LIBRARY_NAME}`);

let shouldErrorOut = false;

main(process.cwd(), options, {
    onInit(workingDirectory) {
        spinner.start();
    },
    onModifiedFilesDetected(modifiedFilenames) {
        if (!modifiedFilenames || !modifiedFilenames.length) {
            return;
        }
        spinner.succeed(` ${LIBRARY_NAME}: ${modifiedFilenames.length} modified file(s) found`);
    },
    onBegunProcessingFile(filename, index, totalFiles) {
        spinner.info(`[${index + 1}/${totalFiles}] Processing file: ${filename}`);
    },
    onFinishedProcessingFile(filename, index, totalFiles: number, status) {
        switch (status) {
            case "UPDATED":
                spinner.succeed(`[${index + 1}/${totalFiles}] Updated formatting in: ${filename}`);
                break;
            case "NOT_UPDATED":
                spinner.succeed(
                    `[${index + 1}/${totalFiles}] No formatting changes required in: ${filename}`
                );
                break;
            case "INVALID_FORMATTING":
                /**
                 * If --check-only is passed as a CLI argument, the script will error out.
                 */
                if (options.checkOnly) {
                    shouldErrorOut = true;
                }
                spinner.fail(
                    `[${index + 1}/${totalFiles}] Invalid formatting detected in: ${filename}`
                );
                break;
        }
    },
    onError(err) {
        spinner.fail(`${LIBRARY_NAME}: An Error occurred\n`);
        console.error(err);
        console.log("\n");
        spinner.stop();
        return process.exit(1);
    },
    onComplete(totalFiles) {
        if (!totalFiles) {
            spinner.info(`${LIBRARY_NAME}: No matching modified files detected.`);
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
});
