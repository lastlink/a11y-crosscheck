const path = require("node:path");

/**
 * pa11y depends on puppeteer, whose install downloads a browser into the user's home cache.
 * Keep it inside the project instead, beside the one src/browser.mjs fetches, so a checkout is
 * self-contained and `.cache/` can simply be gitignored. Copy this file into a project that
 * installs a11y-crosscheck for the same effect there.
 */
module.exports = {
  cacheDirectory: path.join(__dirname, ".cache", "puppeteer")
};
