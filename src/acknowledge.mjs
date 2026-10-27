/**
 * axe reports `incomplete` ("needs review") when it cannot decide a rule by itself and wants a
 * human to look. Those are not violations and never fail the scan -- but they reappear on every
 * run, and a known one printed identically to a brand new one means a genuinely new item hides
 * in the noise. Anything in the config's `acknowledged` list has been checked by hand and is
 * reported as "acknowledged"; everything else is reported as NEW.
 *
 * An entry is deliberately narrow -- rule + reason + markup (or exact target) + page. Change the
 * markup, the palette, or the reason axe gives, and the acknowledgement stops matching and the
 * item goes back to being NEW. Re-check it then rather than widening the entry.
 */

/** How many nodes per needs-review rule a report lists (all are counted). */
const REPORT_NODES = 20;

/**
 * Does this node match an acknowledgement?
 *
 * An entry identifies its nodes by `targets` (exact css paths) or `html` (a substring of the
 * element's markup), and needs one or the other -- an entry with neither would silence a whole
 * rule, which is the opposite of the point. Prefer `html` for anything that appears on more than
 * one page: a css path is not stable, because axe emits the shortest *unique* selector, so the
 * same component is reported under a different one on every page it appears on.
 */
export const isAcknowledged = (acknowledged, page, ruleId, node) =>
  acknowledged.some(
    (a) =>
      a.rule === ruleId &&
      (!a.pages || a.pages === "*" || a.pages.includes(page)) &&
      ((a.targets && a.targets.includes(node.target)) ||
        (a.html && [a.html].flat().some((h) => (node.html || "").includes(h)))) &&
      // Strict on purpose: a missing or changed reason counts as NEW rather than silently matching.
      (a.reason ? node.reason === a.reason : true)
  );

/** Entries with neither `html` nor `targets` would silence a whole rule; refuse them up front. */
export function validateAcknowledged(acknowledged) {
  const bad = acknowledged.filter((a) => !a.rule || (!a.html && !a.targets));
  if (bad.length) {
    throw new Error(
      "every acknowledged entry needs a `rule` and either `html` or `targets`:\n" +
        bad.map((a) => `  ${JSON.stringify(a).slice(0, 160)}`).join("\n")
    );
  }
}

/** Tag every incomplete node as acknowledged or new, and count both per run. */
export function classifyIncomplete(acknowledged, page, r) {
  let known = 0,
    fresh = 0;
  for (const v of r.incomplete) {
    for (const n of v.nodes) {
      n.acknowledged = isAcknowledged(acknowledged, page, v.id, n);
      if (n.acknowledged) known++;
      else fresh++;
    }
    // Every node has been classified; only now is the list trimmed for report size, new ones
    // first. Trimming before classifying would count every trimmed node as new -- on a page
    // with a big text layer (pdf.js, say) that is dozens of phantom "new" items per run.
    const freshNodes = v.nodes.filter((n) => !n.acknowledged);
    const knownNodes = v.nodes.filter((n) => n.acknowledged);
    v.newCount = freshNodes.length;
    v.acknowledgedCount = knownNodes.length;
    v.nodes = [
      ...freshNodes.slice(0, REPORT_NODES),
      ...knownNodes.slice(0, Math.max(0, REPORT_NODES - freshNodes.length))
    ];
    // new nodes that did not fit in the listing -- still counted, still flagged in the report
    v.unlisted = Math.max(0, freshNodes.length - REPORT_NODES);
  }
  r.incompleteAcknowledged = known;
  r.incompleteNew = fresh;
  return r;
}
