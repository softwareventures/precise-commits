import {rimraf} from "rimraf";

/**
 * Destroy the tmp directory that was created in global-setup.ts
 */
export default async () => rimraf("tmp");
