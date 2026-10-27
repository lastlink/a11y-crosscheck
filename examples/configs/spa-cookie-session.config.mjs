/**
 * A Vue/React/Svelte SPA served under /app/, with a JWT session the client restores from
 * cookies, three themes, and dialogs worth auditing. This is the fullest shape the scanner
 * supports, and the one it was first built against.
 *
 * Adds its own flag: --doc=/viewer/?path=... points the reader route at a document that
 * exists on the install being scanned.
 */
const APP = "/app";

export default ({ args }) => {
  const viewer = `${APP}${args.doc || "/viewer/?path=/samples/handbook.epub"}`;

  return {
    baseUrl: "http://localhost:5173",

    // Every route in the router, plus the viewer -- the screen users spend the most time in.
    // `/app/` itself fetches bootstrap and redirects, so it is scanned for what it shows while
    // doing that rather than as a destination.
    pages: [
      `${APP}/`,
      `${APP}/login`,
      `${APP}/library`,
      `${APP}/search`,
      `${APP}/settings`,
      `${APP}/about`,
      viewer
    ],

    // The server answers every path under /app/ with the same index.html, so "loaded" has to
    // mean "mounted and settled". Views fetch on mount and paint a skeleton first: if one is
    // ever slow enough to be scanned mid-skeleton, settleMs is the thing to raise.
    ready: { root: "#app", busy: [".spinner", "[aria-busy='true']"], settleMs: 1200 },

    // The theme picker writes localStorage and the app applies it on boot.
    themes: { values: ["light", "dark", "sepia"], apply: { localStorage: "app-theme" } },

    // The app restores its signed-in state from a JSON cookie, and keeps the bare JWT in a
    // second one so requests the browser issues itself (<img src> for covers) carry a token.
    // Both are needed, or the app renders signed in and every image 401s.
    //
    // Because the client reads these from document.cookie, only the axe run is really signed
    // in. To cover gated routes with pa11y and Lighthouse too, scan a server with auth turned
    // off. See docs/wiring.md#signing-in.
    auth: {
      async signIn({ baseUrl, user, pass }) {
        const res = await fetch(`${baseUrl}/api/users/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: { user_name: user, password: pass } })
        });
        if (!res.ok) throw new Error(`sign-in failed for "${user}": ${res.status}`);
        const body = await res.json();
        const session = body?.result ?? body;
        if (!session?.token) throw new Error("sign-in returned no token; is this the right server?");
        return {
          cookies: [
            { name: "app-user", value: JSON.stringify(session) },
            { name: "app-token", value: session.token }
          ]
        };
      }
    },

    // Screens that only exist after a click. Each waits for something that only exists in that
    // state, and fails the run -- "SKIPPED" -- if it never appears, rather than auditing the
    // page underneath and calling it clean. Prefer ids over text: text changes with locale.
    states: [
      {
        page: viewer,
        label: "viewer settings",
        steps: [{ click: 'button[aria-label="Reader settings"]', waitFor: "#viewer-font-size" }]
      },
      {
        page: `${APP}/settings`,
        label: "add folder",
        // A tab, then the dialog behind it.
        steps: [
          { click: "#settings-tab-permissions", waitFor: "#permissions-add" },
          { click: "#permissions-add", waitFor: '[role="dialog"]' }
        ]
      },
      {
        page: `${APP}/settings`,
        label: "folder picker",
        // A dialog opened from inside a dialog.
        steps: [
          { click: "#settings-tab-permissions", waitFor: "#permissions-add" },
          { click: "#permissions-add", waitFor: "#permissions-browse" },
          { click: "#permissions-browse", waitFor: "#folder-picker" }
        ]
      }
    ],

    // Needs-review items checked by hand. Each says what was measured instead -- see
    // docs/reading-results.md for when an entry is (and is not) the right answer.
    acknowledged: [
      {
        rule: "color-contrast",
        reason: "nonBmp",
        // The theme toggle's glyphs. Keyed on markup: the same component is reported under a
        // different css path on every page it appears on.
        html: ['<span aria-hidden="true">☀</span>', '<span aria-hidden="true">☾</span>'],
        why:
          "Symbol characters, which axe will not measure. They are aria-hidden icons with an " +
          "sr-only label; their colour is the button's, measured in every theme by contrast.spec.ts."
      },
      {
        rule: "color-contrast",
        reason: "bgOverlap",
        // pdf.js's selectable text layer, over every rendered PDF page
        html: 'role="presentation" dir="ltr"',
        why:
          "Transparent on purpose: it exists so text can be selected and searched. What is seen " +
          "is the canvas beneath -- the document's own page, which axe cannot sample."
      }
    ]
  };
};
