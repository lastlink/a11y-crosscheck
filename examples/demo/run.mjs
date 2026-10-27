/**
 * Starts the demo app, scans it signed in, and stops it -- the whole wiring end to end.
 *
 *   npm run demo           # the app as written: should come back clean
 *   npm run demo:broken    # the same app with deliberate failures, to see a dirty report
 *
 * Extra flags are passed through to the scanner: `npm run demo -- --only=axe`.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "./serve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const flags = process.argv.slice(2);
const server = await start({ port: 0, broken: flags.includes("--broken") });
const port = server.address().port;

// spawn, not spawnSync: the server lives in this process, and blocking the event loop while
// the scan runs would leave it unable to answer a single request.
const child = spawn(
  process.execPath,
  [
    path.join(here, "..", "..", "bin", "a11y-crosscheck.mjs"),
    `--config=${path.join(here, "a11y.config.mjs")}`,
    `--url=http://localhost:${port}`,
    "--login=demo:demo",
    ...flags.filter((f) => f !== "--broken")
  ],
  { stdio: "inherit" }
);
const status = await new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));

server.close();
process.exit(status);
