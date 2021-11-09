const rimraf = require("rimraf");

/**
 * Destroy the tmp directory that was created in global-setup.js
 */
module.exports = async () =>
    new Promise((resolve, reject) => rimraf("tmp", err => (err == null ? resolve() : reject(err))));
