/**
 * Lighthouse, accessibility category only -- the score people actually quote.
 *
 * It shares the axe engine, so its findings are normally a *subset* of axe's: a curated rule
 * list weighted into a 0-100 score. Runs once per page, through its node API on a page the scan
 * prepared, with its own (mobile) device emulation and its own wait for the page to go quiet.
 *
 * `disableStorageReset` is what keeps the session: by default Lighthouse clears the origin's
 * storage, cookies included, before it navigates.
 */
import { launch, preparePage, puppeteerFor } from "../puppeteer.mjs";

export async function runLighthouse(plan, executablePath, session) {
  const lighthouse = (await import("lighthouse")).default;
  const browser = await launch(puppeteerFor("lighthouse", "puppeteer-core"), executablePath);
  const out = {};
  try {
    for (const p of plan.pages) {
      const page = await browser.newPage();
      try {
        await preparePage(page, plan, session, { viewport: false });
        const result = await lighthouse(
          plan.base + p,
          {
            output: "json",
            logLevel: "error",
            onlyCategories: ["accessibility"],
            disableStorageReset: true
          },
          undefined,
          page
        );
        const json = result.lhr;
        const cat = json.categories.accessibility;
        out[p] = {
          score: Math.round(cat.score * 100),
          failures: cat.auditRefs
            .map((ref) => ({ ref, a: json.audits[ref.id] }))
            .filter((x) => x.a && x.a.score !== null && x.a.score < 1)
            .map((x) => ({
              id: x.a.id,
              weight: x.ref.weight,
              title: x.a.title,
              nodes: (x.a.details?.items || []).length,
              targets: (x.a.details?.items || [])
                .slice(0, 5)
                .map((it) => String(it.node?.selector || it.node?.snippet || "").slice(0, 160))
                .filter(Boolean)
            }))
        };
      } catch (e) {
        out[p] = {
          error: String(e.message || e)
            .split("\n")[0]
            .slice(0, 240)
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
