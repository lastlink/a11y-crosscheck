/**
 * pa11y, which wraps HTML_CodeSniffer -- a different engine, not an axe wrapper -- so it
 * catches things axe deliberately skips, and can disagree with axe in either direction.
 *
 * Runs once per page in the default theme and viewport. The scan navigates and waits for the
 * app itself, then hands pa11y the rendered page (`ignoreUrl`): pa11y's own navigation stops at
 * the load event, which for a single-page app is the empty shell.
 */
import { launch, preparePage, puppeteerFor, waitForApp } from "../puppeteer.mjs";

export async function runPa11y(plan, executablePath, session) {
  const pa11y = (await import("pa11y")).default;
  const browser = await launch(puppeteerFor("pa11y", "puppeteer"), executablePath);
  const out = {};
  try {
    for (const p of plan.pages) {
      const url = plan.base + p;
      const page = await browser.newPage();
      try {
        await preparePage(page, plan, session);
        await page.goto(url, { waitUntil: "load", timeout: 60000 });
        const rendered = await waitForApp(page, plan.ready);
        const res = await pa11y(url, {
          includeWarnings: false,
          timeout: 60000,
          ...plan.pa11y,
          browser,
          page,
          ignoreUrl: true
        });
        out[p] = {
          issues: res.issues.map((i) => ({
            code: i.code,
            type: i.type,
            message: i.message,
            selector: i.selector,
            context: (i.context || "").slice(0, 200)
          })),
          ...(rendered ? {} : { notReady: true })
        };
      } catch (e) {
        out[p] = {
          error: String(e.message || e)
            .split("\n")[0]
            .slice(0, 200)
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}
