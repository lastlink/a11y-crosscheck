/**
 * One scan: sign in, run each requested engine, print a console summary, write the reports,
 * and return the exit code -- non-zero if any engine found anything, so a scan can gate a
 * commit or a deploy.
 */
import path from "node:path";
import { ensureBrowser } from "./browser.mjs";
import { validateAcknowledged } from "./acknowledge.mjs";
import { signIn } from "./session.mjs";
import { createReporter } from "./report.mjs";
import { runAxe } from "./engines/axe.mjs";
import { runPa11y } from "./engines/pa11y.mjs";
import { runLighthouse } from "./engines/lighthouse.mjs";

export async function scan(plan) {
  validateAcknowledged(plan.acknowledged);
  const browser = ensureBrowser({ quiet: true });
  const session = await signIn(plan);
  const report = createReporter(plan, browser);
  const results = {};
  const written = [];
  const rel = (f) => path.relative(process.cwd(), f);

  console.log(`Config : ${plan.configFile ? rel(plan.configFile) : "none (pages as they are)"}`);
  console.log(`Browser: ${browser}`);
  console.log(`Target : ${plan.base}  (${plan.pages.length} pages)`);
  console.log(
    `Variants: ${plan.themes.values.join(", ")} x ${plan.viewportNames.join(", ")}  (axe only)`
  );
  console.log(
    `Signed : ${session ? plan.login.user : "no" + (plan.auth ? "  -- gated routes will show the login form" : "")}`
  );
  console.log(`Reports: ${plan.out}\n`);

  if (plan.engines.includes("axe")) {
    console.log("=== axe-core ===");
    results.axe = await runAxe(plan, browser, session);
    for (const run of plan.runs) {
      const p = run.key;
      const r = results.axe[p];
      if (r.unreachable) {
        // Loud on purpose: this row audited nothing, and a "0 rule(s)" line for a state that
        // never opened is worse than no line at all.
        console.log(`  ${p.padEnd(34)} SKIPPED - ${r.unreachable}`);
        continue;
      }
      const n = r.violations.reduce((s, v) => s + v.nodes.length, 0);
      const inc = r.incompleteAcknowledged + r.incompleteNew;
      console.log(
        `  ${p.padEnd(34)} ${r.violations.length} rule(s), ${n} node(s)` +
          (inc
            ? `  [${inc} needs-review: ${r.incompleteAcknowledged} acknowledged, ${r.incompleteNew} new]`
            : "") +
          (r.notReady ? "  (never matched `ready`; may be mid-render)" : "")
      );
      r.violations.forEach((v) => console.log(`      [${v.impact}] ${v.id} - ${v.help}`));
      // Only the unacknowledged ones are worth a line - the acknowledged ones are in the report.
      r.incomplete.forEach((v) =>
        v.nodes
          .filter((x) => !x.acknowledged)
          .forEach((x) =>
            console.log(
              `      NEW needs-review: ${v.id} -> ${x.target}${x.reason ? ` (${x.reason})` : ""}`
            )
          )
      );
    }
    written.push(report.engine("axe", results.axe));
  }

  if (plan.engines.includes("pa11y")) {
    console.log(`\n=== pa11y (HTML_CodeSniffer, ${plan.pa11y.standard}) ===`);
    results.pa11y = await runPa11y(plan, browser, session);
    for (const p of plan.pages) {
      const r = results.pa11y[p];
      if (r.error) {
        console.log(`  ${p.padEnd(22)} ERROR ${r.error}`);
        continue;
      }
      console.log(
        `  ${p.padEnd(22)} ${r.issues.length} issue(s)` +
          (r.notReady ? "  (never matched `ready`; may be mid-render)" : "")
      );
      const byCode = {};
      r.issues.forEach((i) => {
        byCode[i.code] = (byCode[i.code] || 0) + 1;
      });
      Object.entries(byCode).forEach(([c, n]) => console.log(`      ${n}x ${c}`));
    }
    written.push(report.engine("pa11y", results.pa11y));
  }

  if (plan.engines.includes("lighthouse")) {
    console.log("\n=== lighthouse (accessibility) ===");
    results.lighthouse = await runLighthouse(plan, browser, session);
    for (const p of plan.pages) {
      const r = results.lighthouse[p];
      if (r.error) {
        console.log(`  ${p.padEnd(22)} ERROR ${r.error}`);
        continue;
      }
      console.log(
        `  ${p.padEnd(22)} score ${r.score}` +
          (r.failures.length
            ? `  failing: ${r.failures.map((f) => `${f.id}(w${f.weight})`).join(", ")}`
            : "  (clean)")
      );
    }
    written.push(report.engine("lighthouse", results.lighthouse));
  }

  written.push(report.summary(results));

  console.log("\nReports written:");
  written.forEach((w) => console.log(`  ${rel(w.json)}\n  ${rel(w.html)}`));

  const axeBad = Object.values(results.axe || {}).some((r) => r.violations?.length || r.unreachable);
  const pa11yBad = Object.values(results.pa11y || {}).some((r) => r.issues?.length || r.error);
  const lhBad = Object.values(results.lighthouse || {}).some((r) => r.failures?.length || r.error);
  return axeBad || pa11yBad || lhBad ? 1 : 0;
}
