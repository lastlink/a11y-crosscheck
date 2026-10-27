/**
 * A headless Chromium driven directly over the DevTools Protocol -- no puppeteer -- so the axe
 * run can plant a session, choose a theme before the app boots, and click its way into dialogs.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { readyExpression } from "./boot.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchCdp(browser, port = 9333) {
  const proc = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(process.cwd(), ".cache", "a11y-profile")}`,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 80; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((x) => x.json())
      .catch(() => null);
    const page =
      Array.isArray(list) && list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (page) return { proc, wsUrl: page.webSocketDebuggerUrl };
    await sleep(250);
  }
  proc.kill();
  throw new Error("CDP endpoint never became available");
}

export class Cdp {
  /**
   * @param {WebSocket} ws
   * @param {object} ready  the plan's `ready` block: what "this route has rendered" means
   */
  constructor(ws, ready) {
    this.ws = ws;
    this.ready = ready;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      const entry = m.id && this.pending.get(m.id);
      if (!entry) return;
      this.pending.delete(m.id);
      if (m.error) entry.reject(new Error(JSON.stringify(m.error)));
      else entry.resolve(m.result);
    });
  }

  static async connect(wsUrl, ready) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    return new Cdp(ws, ready);
  }

  close() {
    this.ws.close();
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) {
      if ((await this.eval("document.readyState").catch(() => null)) === "complete") break;
      await sleep(150);
    }
    return this.waitForApp();
  }

  /**
   * Clicks the first match once it is there and enabled, and says whether it managed to.
   *
   * The wait is the whole point: controls are often disabled while their panel fetches, and
   * `el.click()` on a disabled button does nothing at all -- silently, so the step "succeeds"
   * and the state never opens.
   */
  async click(selector, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const clicked = await this.eval(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
          el.click();
          return true;
        })()`
      ).catch(() => false);
      if (clicked) return true;
      await sleep(150);
    }
    return false;
  }

  /** Polls for a selector to exist. Returns false rather than throwing when it never does. */
  async waitForSelector(selector, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const there = await this.eval(`!!document.querySelector(${JSON.stringify(selector)})`).catch(
        () => false
      );
      if (there) return true;
      await sleep(150);
    }
    return false;
  }

  /**
   * Waits for the app to have rendered something worth auditing (see readyExpression), then
   * settles, because views fetch on mount and paint a skeleton first. Says whether it got there.
   */
  async waitForApp() {
    const { settleMs, timeoutMs } = this.ready;
    const expression = readyExpression(this.ready);
    let ready = false;
    for (let waited = 0; waited < timeoutMs; waited += 250) {
      ready = await this.eval(expression).catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    // Content that arrives late -- images, a second fetch -- lands within this window.
    await sleep(settleMs);
    return !!ready;
  }
}
