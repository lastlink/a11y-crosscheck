/**
 * What every engine's browser needs before and after the app boots, defined once so the three
 * engines cannot drift apart: the same state planted, the same notion of "rendered".
 */

/**
 * A script that runs at the start of every document on the app's origin, before the app's own
 * scripts: the session's localStorage, then the theme -- exactly as if both had been left there
 * by an earlier visit. Returns null when there is nothing to plant.
 */
export function bootScript(plan, session, theme) {
  const parts = [];
  if (session && Object.keys(session.localStorage).length) {
    parts.push(`{
      const entries = ${JSON.stringify(session.localStorage)};
      for (const k in entries) try { localStorage.setItem(k, entries[k]); } catch {}
    }`);
  }
  const themeSource = plan.themes.script(theme);
  if (themeSource) parts.push(themeSource);
  if (!parts.length) return null;
  return `if (location.origin === ${JSON.stringify(new URL(plan.base).origin)}) {\n${parts.join("\n")}\n}`;
}

/**
 * An expression that is truthy once the app has rendered something worth auditing.
 *
 * `readyState === 'complete'` is not the end of the story for a single-page app -- it only
 * means the empty shell arrived: the framework has not mounted, no route component exists,
 * and an engine would grade `<div id="app"></div>` and find nothing wrong with it. So this
 * waits for the root to have children, for every busy indicator to go, and for the body to
 * have text. `ready.check`, when given, replaces all of that with an expression of your own.
 */
export function readyExpression({ check, root, busy, requireText }) {
  if (check) return `(() => !!(${check}))()`;
  return `(() => {
    const root = document.querySelector(${JSON.stringify(root)});
    if (!root || root.children.length === 0) return false;
    if (${JSON.stringify(busy)}.some((s) => document.querySelector(s))) return false;
    return ${requireText ? "(document.body.innerText || '').trim().length > 0" : "true"};
  })()`;
}
