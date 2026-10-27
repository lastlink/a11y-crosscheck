/**
 * pa11y and Lighthouse each accept a puppeteer page instead of opening their own, and that is
 * what lets them see the same app axe sees: the session planted (cookies, localStorage,
 * headers), the theme chosen before boot, and -- for pa11y -- the same wait for the app to
 * render. Without it they drive a bare browser and grade the login form on every gated route.
 *
 * Each engine gets a page from *its own* puppeteer, resolved from inside the engine's package,
 * so the page is the exact version the engine was built against (pa11y and Lighthouse pin
 * different majors).
 */
import { createRequire } from "node:module";
import { bootScript, readyExpression } from "./boot.mjs";

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `puppeteerFor("pa11y", "puppeteer")` -- the puppeteer that pa11y itself would load. */
export function puppeteerFor(engine, name) {
  return createRequire(require.resolve(engine))(name);
}

export function launch(puppeteer, executablePath) {
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"]
  });
}

/**
 * Plants the session and the default theme on a fresh page. `viewport` is false for Lighthouse,
 * which applies its own device emulation and would be fighting this one.
 */
export async function preparePage(page, plan, session, { viewport = true } = {}) {
  const theme = plan.themes.values[0];
  if (viewport) {
    const vp = plan.viewports[plan.viewportNames[0]];
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile
    });
  }
  if (session) {
    if (session.cookies.length) {
      await page.setCookie(
        ...session.cookies.map((c) => (c.domain ? { path: "/", ...c } : { url: plan.base, ...c }))
      );
    }
    if (Object.keys(session.headers).length) await page.setExtraHTTPHeaders(session.headers);
  }
  if (plan.themes.emulateColorScheme) {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  }
  const source = bootScript(plan, session, theme);
  if (source) await page.evaluateOnNewDocument(source);
}

/** The puppeteer twin of Cdp.waitForApp: wait for `ready`, then settle. Says whether it got there. */
export async function waitForApp(page, ready) {
  const ok = await page
    .waitForFunction(readyExpression(ready), { timeout: ready.timeoutMs, polling: 250 })
    .then(
      () => true,
      () => false
    );
  await sleep(ready.settleMs);
  return ok;
}
