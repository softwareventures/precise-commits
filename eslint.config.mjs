import config from "@softwareventures/eslint-config";
import {defineConfig} from "eslint/config";

export default defineConfig(config, {
    ignores: [".idea/**", "**/node_modules/**", "lib/**", "tmp/**", "test/fixtures/**"]
});
