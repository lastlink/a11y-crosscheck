# Wiring a scan to your app

The engines know nothing about your app. Everything specific to it lives in
`a11y.config.mjs`, which answers six questions. Answer only the ones your app raises: a
static site needs `pages` and nothing else.

```js
// a11y.config.mjs -- every field is optional
export default ({ args }) => ({
  baseUrl: "http://localhost:5173",
  pages: ["/", "/about"],
  ready: { root: "#app", busy: [".spinner"], settleMs: 1000 },
  themes: { values: ["light", "dark"], apply: { localStorage: "theme" } },
  viewports: { desktop: { width: 1366, height: 900, mobile: false } },
  auth: { async signIn({ baseUrl, user, pass }) { /* ... */ return { cookies: [] }; } },
  states: [{ page: "/", label: "menu", steps: [{ click: "#menu", waitFor: "[role=menu]" }] }],
  axe: { tags: [/* ... */], rules: {} },
  pa11y: { standard: "WCAG2AA" },
  acknowledged: [],
  out: "reports/a11y"
});
```

The config can export an object, or a function that receives `{ args }` (every command-line
flag) and returns one. Use the function form when a flag should change what is scanned.

- [Which pages](#which-pages)
- [When is a page rendered?](#when-is-a-page-rendered)
- [Signing in](#signing-in)
- [Themes and viewports](#themes-and-viewports)
- [Screens behind a click](#screens-behind-a-click)
- [Rule sets](#rule-sets)
- [Acknowledged findings](#acknowledged-findings)

## Which pages

```js
pages: ["/app/", "/app/login", "/app/library", "/app/settings"]
```

Paths, each appended to `baseUrl`. List **every route in your router**, not a sample. Routes
that need data to point at (a document viewer, a record page) need a real id from the install
you scan. A custom flag keeps that out of the config:

```js
export default ({ args }) => ({
  pages: ["/", `/viewer/?doc=${args.doc || "sample.pdf"}`]
});
```

`--pages` on the command line replaces the list for one run.

## When is a page rendered?

```js
ready: {
  root: "#app",                 // must exist and have children
  busy: [".spinner", "[aria-busy='true']"],   // none of these may be present
  requireText: true,            // the body must have visible text
  settleMs: 1200,               // then wait this long for late content
  timeoutMs: 30000              // give up waiting (the run continues, flagged)
}
```

This is the setting that matters most for a single-page app, and the easiest to get wrong
without noticing.

`document.readyState === 'complete'` does not mean the page is there. For an SPA it only means
the empty shell arrived: the server answers every route with the same `index.html`, and the
framework renders the rest. Audit at that moment and you grade `<div id="app"></div>`, which
has nothing wrong with it. The report says clean, and that result is worthless.

So the scan waits for your root element to have children, for every busy indicator to be gone,
and for the body to have text. Then it waits a little longer (`settleMs`), because most views
fetch on mount and paint a skeleton first. If a view is ever slow enough to be scanned
mid-skeleton, `settleMs` is the thing to raise.

The defaults (`root: "body"`, no busy selectors) suit a server-rendered site. For an SPA, set
`root` and `busy`, or the scan can grade your loading spinner.

If your app can say when it is ready, that is better than any heuristic:

```js
ready: { check: "document.documentElement.hasAttribute('data-ready')", settleMs: 300 }
```

`check` is any JavaScript expression evaluated in the page, and it replaces `root`, `busy`
and `requireText`. A run that never matches `ready` is still audited, but it is flagged in the
console and the report as possibly mid-render.

## Signing in

```js
auth: {
  async signIn({ baseUrl, user, pass }) {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pass })
    });
    if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
    const { token } = await res.json();
    return { cookies: [{ name: "session", value: token }] };
  }
}
```

Without a session, every gated route redirects to the login form and the scan grades that same
screen once per route. Every result comes back clean, and none of it tells you anything about
the gated pages.

`signIn` is called once, with the credentials from `--login=user:pass` or `A11Y_USER` /
`A11Y_PASS`. It does whatever your app's sign-in does and returns **what the app reads back on
load**:

| Return | Planted as | Use when |
| --- | --- | --- |
| `cookies: [{ name, value, path?, domain?, httpOnly?, secure? }]` | real browser cookies on the app's host | the session is a cookie, server- or client-read |
| `localStorage: { key: value }` | set before the app's own scripts run | the client restores its session from storage |
| `headers: { Authorization: "Bearer ..." }` | sent with every request | the API wants a header the app would add |

Return any combination. All three engines get all of it before the app boots, so pa11y and
Lighthouse see signed-in pages too.

Plant everything your app needs, not just the token. A common trap is an app that keeps a user
object and a token separately, for example a JSON cookie it restores state from plus a bare JWT
cookie so that requests the browser makes itself (`<img src>`) carry auth. If you plant only
one, the app renders signed in while every image returns 401.
[spa-cookie-session.config.mjs](../examples/configs/spa-cookie-session.config.mjs) shows that
case.

Each engine starts with a clean browser. The axe run reuses a profile directory, so the scanner
clears its cookies, localStorage, service workers and cache storage first. Otherwise a run
without `--login` would quietly scan the session left over from the last one. A PWA's service
worker is bypassed for the same reason: it would answer from the *previous* deploy's precache.

**Covering signed-out pages too.** Run twice, once with `--login` and once without. Or, if your
server can run with auth disabled, scan that: every route then renders its real content with no
session at all.

## Themes and viewports

```js
themes: {
  values: ["light", "dark", "sepia"],
  default: "light",                     // optional; else the first value
  apply: { localStorage: "app-theme" }  // or "prefers-color-scheme", or a function
}
```

A theme redeclares every colour, so each theme is a different set of contrast pairs for the
same markup. A scan that sees only one theme misses the others; failures that show up in only
one theme are common.

Themes are applied the way a user applies them, **before the app boots**, so the run exercises
your code that reads the preference rather than forcing a class onto `<html>`:

| `apply` | Does |
| --- | --- |
| `{ localStorage: "key" }` | `localStorage.setItem(key, theme)` at document start |
| `"prefers-color-scheme"` | emulates the media query; values must be `light` / `dark` |
| `(theme) => "js source"` | your own script, run at document start |

With no `themes`, a single unnamed theme runs.

```js
viewports: {
  desktop: { width: 1366, height: 900, mobile: false },
  phone: { width: 390, height: 844, mobile: true }
}
```

Those two are the default. A phone layout swaps navigation, hides chrome and moves touch
targets around, which is a different set of nodes for rules like `target-size` to fire on.

The first theme (or `default`) and the first viewport make up the **default variant**. Its runs
are keyed by the bare path; every other run is keyed `"/path [theme, viewport]"`. pa11y,
Lighthouse and interactive states run in the default variant only.

## Screens behind a click

```js
states: [
  {
    page: "/settings",
    label: "add folder",
    steps: [
      { click: "#settings-tab-permissions", waitFor: "#permissions-add" },
      { click: "#permissions-add", waitFor: '[role="dialog"]' }
    ]
  }
]
```

Dialogs, popovers, menus and side panels are often an app's most custom markup, and they are
mounted on click, so a scan of first paints never looks at them. Each state navigates to its
`page` (which must be in `pages`), performs its steps in order, and audits what is on screen
then.

A `click` waits for its target to be **present and enabled** before clicking. Controls are
often disabled while their panel loads, and clicking a disabled button does nothing, without
any error, so a careless step would appear to succeed. `waitFor` should be something that only
exists in the new state. Prefer ids and roles over text, because text changes with locale.

**A state that cannot be opened is reported, not skipped quietly.** It prints `SKIPPED` with
the step that failed and fails the run. A `0 violations` line for a dialog that never opened is
worse than no line at all. Many states need data to reach (a user to preview, a group to edit),
so on an empty install the run tells you it couldn't open them instead of passing.

States run in the default variant only. A dialog's colours come from the same tokens as every
other screen, so the theme matrix over whole pages already covers them; what is worth scanning
in a dialog is structure (labels, roles, headings), and structure does not change with the
palette.

## Rule sets

```js
axe: {
  tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],  // default
  rules: { "label-content-name-mismatch": { enabled: true } }                       // default, merged
},
pa11y: { standard: "WCAG2AA" }   // or "WCAG2A", "WCAG2AAA"; any other pa11y option passes through
```

The default axe run adds `label-content-name-mismatch` (WCAG 2.5.3 Label in Name, Level A).
axe tags it experimental and skips it by default. Lighthouse turns it on, but Lighthouse only
sees the default variant, so without the opt-in nothing would check it in the rest of the
matrix.

## Acknowledged findings

```js
acknowledged: [
  {
    rule: "color-contrast",
    reason: "nonBmp",
    html: '<span aria-hidden="true">☀</span>',
    why: "aria-hidden icon glyph; its colour is the button's, measured in contrast.spec.ts"
  }
]
```

For axe's "needs review" items, after a person has checked them. They never fail a scan; the
list exists so that a new one stands out. What earns an entry, and how narrow it should be, is
in [reading-results.md](reading-results.md#needs-review-and-acknowledgements).
