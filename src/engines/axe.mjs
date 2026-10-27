/**
 * axe-core, injected into the live page over the DevTools Protocol.
 *
 * This is the only engine that runs the full matrix -- every page in every theme at every
 * viewport, plus the interactive states. The other two are per-page engines (a score, a
 * standard) and run once per page in the default variant; axe is the one this gates on.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { launchCdp, Cdp } from "../cdp.mjs";
import { classifyIncomplete } from "../acknowledge.mjs";
import { bootScript } from "../boot.mjs";

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runAxe(plan, browser, session) {
  const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const { proc, wsUrl } = await launchCdp(browser);
  const cdp = await Cdp.connect(wsUrl, plan.ready);
  try {
    return await scanAll(cdp, plan, session, axeSource);
  } finally {
    cdp.close();
    proc.kill();
  }
}

async function scanAll(cdp, plan, session, axeSource) {
  const { base } = plan;
  const origin = new URL(base).origin;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  // The browser reuses a profile directory across runs, so a session from an earlier scan is
  // still sitting in it. Without this, omitting --login does not scan the signed-out app -- it
  // scans the signed-in one and reports that everything is fine.
  await cdp.send("Network.clearBrowserCookies");
  // The reused profile also keeps a PWA's service worker, which answers from its precache -- so
  // a scan after a redeploy grades the *previous* bundle, and a fix can look "not fixed" (or a
  // regression "clean") for a whole run. Bypass it and drop what it cached.
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  await cdp
    .send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "service_workers,cache_storage,local_storage"
    })
    .catch(() => undefined);

  if (session) {
    const { hostname } = new URL(base);
    for (const c of session.cookies) {
      await cdp.send("Network.setCookie", { path: "/", ...c, domain: c.domain || hostname });
    }
    if (Object.keys(session.headers).length) {
      await cdp.send("Network.setExtraHTTPHeaders", { headers: session.headers });
    }
  }

  const out = {};
  let bootScriptId = null;
  for (const run of plan.runs) {
    const viewport = plan.viewports[run.viewport];
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });

    // Themes are set the way a user sets them -- before the app boots -- so a run exercises the
    // code that applies them rather than forcing a class onto <html>.
    if (plan.themes.emulateColorScheme) {
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: run.theme }]
      });
    }
    if (bootScriptId) {
      await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: bootScriptId });
      bootScriptId = null;
    }
    const source = bootScript(plan, session, run.theme);
    if (source) {
      ({ identifier: bootScriptId } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source
      }));
    }

    const rendered = await cdp.goto(base + run.page);

    if (run.steps) {
      const failed = await walkSteps(cdp, run.steps);
      // A state that cannot be reached is reported, never silently skipped: a scan that quietly
      // audits the page behind an unopened dialog reports clean and means nothing.
      if (failed) {
        out[run.key] = {
          violations: [],
          incomplete: [],
          incompleteAcknowledged: 0,
          incompleteNew: 0,
          unreachable: `could not open "${run.label}": ${failed}`
        };
        continue;
      }
      await sleep(600);
    }

    await cdp.eval(axeSource);
    const raw = await cdp.eval(axeExpression(plan.axe));
    const result = classifyIncomplete(plan.acknowledged, run.page, JSON.parse(raw));
    // Not a failure -- some pages legitimately never match the ready check -- but a row that
    // may have been audited mid-skeleton should say so.
    if (!rendered) result.notReady = true;
    out[run.key] = result;
  }
  return out;
}

/** Runs a state's click/waitFor steps; returns why it failed, or null. */
async function walkSteps(cdp, steps) {
  for (const step of steps) {
    if (!(await cdp.click(step.click))) return `nothing clickable matched "${step.click}"`;
    if (step.waitFor && !(await cdp.waitForSelector(step.waitFor))) {
      return `clicked "${step.click}" but "${step.waitFor}" never appeared`;
    }
  }
  return null;
}

function axeExpression({ tags, rules }) {
  return `
    axe.run(document, {
      resultTypes: ['violations', 'incomplete'],
      runOnly: { type: 'tag', values: ${JSON.stringify(tags)} },
      rules: ${JSON.stringify(rules)}
    }).then(r => JSON.stringify({
      violations: r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
        tags: v.tags.filter(t => /^wcag|best-practice/.test(t)),
        nodes: v.nodes.slice(0, 8).map(n => ({ target: n.target.join(' '), html: (n.html || '').slice(0, 200) }))
      })),
      incomplete: r.incomplete.map(v => ({
        id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
        // every node, not a sample: each has to be checked against the acknowledgements before
        // the report trims the list (classifyIncomplete).
        nodes: v.nodes.map(n => ({
          target: n.target.join(' '),
          // The markup, so an acknowledgement can key off something stable. A css path is not:
          // axe emits the shortest *unique* selector, so the same element is reported under a
          // different one on every page, and either changes the moment a sibling does.
          html: (n.html || '').slice(0, 200),
          // axe's own messageKey for WHY it could not decide (e.g. 'bgGradient'). It is what
          // makes an acknowledgement specific: a different reason is a new situation.
          reason: (n.any[0] || {}).data ? (n.any[0].data.messageKey || null) : null
        }))
      }))
    }))
  `;
}
