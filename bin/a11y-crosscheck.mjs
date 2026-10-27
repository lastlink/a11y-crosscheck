#!/usr/bin/env node
/**
 * Accessibility scan with three independent engines -- axe-core, pa11y, Lighthouse -- against
 * a running site, driven by the project's a11y.config.mjs. See README.md.
 *
 *   a11y-crosscheck                          # every engine, every page in the config
 *   a11y-crosscheck --only=axe --login=u:p   # the gate, signed in
 *   a11y-crosscheck --install-browser        # fetch the local Chromium and stop
 */
import { loadPlan } from "../src/config.mjs";
import { ensureBrowser } from "../src/browser.mjs";
import { scan } from "../src/scan.mjs";

const HELP = `a11y-crosscheck [flags]

  --config=path      config module (default: ./a11y.config.mjs, if present)
  --url=URL          base URL; overrides --port and the config's baseUrl
  --port=N           shorthand for http://localhost:N
  --only=a,b         engines: axe, pa11y, lighthouse (default: all three)
  --pages=/a,/b      paths to scan, each appended to the base URL
  --themes=a,b       themes to run (axe only); must be values the config can apply
  --viewports=a,b    viewport names from the config (default: desktop, phone)
  --states=off       skip the interactive states
  --login=user:pass  sign in via the config's auth.signIn (also A11Y_USER / A11Y_PASS)
  --out=dir          report directory (default: reports/a11y)
  --install-browser  resolve or download Chromium, then exit
  --help

Any other --flag=value is passed to the config function as args.flag.
Exits 1 if any engine reports a finding.`;

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

if (argv.includes("--install-browser")) {
  try {
    ensureBrowser();
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

try {
  process.exit(await scan(await loadPlan(argv)));
} catch (e) {
  console.error(`a11y-crosscheck: ${e.message}`);
  process.exit(2);
}
