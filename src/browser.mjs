/**
 * Resolve a Chromium for the scan, downloading one if there is none.
 *
 * Why not the installed Edge: pa11y and Lighthouse both drive the browser through puppeteer,
 * and puppeteer cannot launch Windows' msedge.exe -- it forks and exits, so puppeteer's
 * process handle dies and it reports "Failed to launch the browser process" with no further
 * detail. A real Chromium is required, and a pinned one also makes results reproducible.
 *
 * Resolution order: CHROME_PATH, then the local cache, then a system Chrome/Chromium.
 * The cache is ./.cache/puppeteer under the directory the scan runs from (override with
 * A11Y_BROWSER_CACHE), so a checkout is self-contained and `.cache/` can simply be gitignored.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const CACHE = process.env.A11Y_BROWSER_CACHE
  ? path.resolve(process.env.A11Y_BROWSER_CACHE)
  : path.join(process.cwd(), ".cache", "puppeteer");

/** Executable layouts used by Chrome for Testing / Chromium across platforms. */
const EXE_CANDIDATES = [
  "chrome-win64/chrome.exe",
  "chrome-win32/chrome.exe",
  "chrome-linux64/chrome",
  "chrome-linux/chrome",
  "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium"
];

/** Look through the local cache for any installed Chromium build. */
export function findLocalBrowser() {
  if (!existsSync(CACHE)) return null;
  const found = [];
  // cache layout: .cache/puppeteer/<browser>/<platform-buildId>/<exe layout>
  for (const browser of readdirSync(CACHE)) {
    const bdir = path.join(CACHE, browser);
    let builds = [];
    try {
      builds = readdirSync(bdir);
    } catch {
      continue;
    }
    for (const build of builds) {
      for (const exe of EXE_CANDIDATES) {
        const full = path.join(bdir, build, exe);
        if (existsSync(full)) found.push(full);
      }
    }
  }
  // newest build id sorts last lexically for the platform-version naming scheme
  return found.sort().pop() || null;
}

/** Any system Chromium/Chrome, as a last resort. Edge is deliberately excluded. */
function findSystemChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Chromium/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  return candidates.find((c) => existsSync(c)) || null;
}

/**
 * @param {{quiet?: boolean}} [opts]
 * @returns {string} absolute path to a Chromium executable
 */
export function ensureBrowser(opts = {}) {
  const log = (m) => {
    if (!opts.quiet) console.log(m);
  };

  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH is set but does not exist: ${process.env.CHROME_PATH}`);
  }

  const local = findLocalBrowser();
  if (local) {
    log(`Chromium ready: ${local}`);
    return local;
  }

  const system = findSystemChrome();
  if (system) {
    log(`Using system Chromium: ${system}`);
    return system;
  }

  // Said even when quiet: a first scan otherwise sits silent through a ~150MB download.
  console.log(`No local Chromium found - downloading (one-time, into ${CACHE})...`);
  // "chromium" has no pinned build in every puppeteer version, so ask for latest; the
  // Chrome for Testing build is the fallback and is itself an unbranded Chromium.
  for (const id of ["chromium@latest", "chrome@stable"]) {
    // shell:true so Windows resolves npx.cmd/npx.ps1 off PATH; spawning "npx.cmd"
    // directly fails silently there -- and with a shell, the path needs its own quotes.
    const r = spawnSync("npx", ["--yes", "@puppeteer/browsers", "install", id, "--path", `"${CACHE}"`], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true
    });
    if (r.status === 0) {
      const got = findLocalBrowser();
      if (got) {
        log(`Installed ${id}: ${got}`);
        return got;
      }
    }
    log(`Could not install ${id}, trying next option...`);
  }
  throw new Error(
    "Could not obtain a Chromium build.\n" +
      "Install one manually, then set CHROME_PATH:\n" +
      "  npx @puppeteer/browsers install chrome@stable"
  );
}
