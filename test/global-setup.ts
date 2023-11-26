import {mkdirp} from "mkdirp";

/**
 * Create the tmp directory in which our `.git` directory
 * under test will live, and all the temp files will be
 * created and updated.
 */
export default async (): Promise<void> => void mkdirp("tmp");
