const path = require("node:path");

/**
 * pa11y depends on puppeteer, whose install downloads a browser into the user's home cache.
 * Point it at the tool's own cache instead -- the same place src/browser.mjs looks first and
 * downloads to -- so a global install, a dev dependency or this checkout each keep exactly one
 * browser, beside the tool, and never in the project being scanned.
 */
module.exports = {
  cacheDirectory: path.join(__dirname, ".cache", "puppeteer")
};
