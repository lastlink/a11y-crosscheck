/**
 * The demo app's wiring. Every block here is one of the questions docs/wiring.md walks
 * through, answered for examples/demo/site -- read the two side by side.
 */
export default () => ({
  baseUrl: "http://localhost:4173",

  // Every route the app has. The client renders all of them from the same index.html.
  pages: ["/", "/about", "/account"],

  // "Rendered" means: #app has children, the spinner is gone, and there is text on screen.
  ready: { root: "#app", busy: [".spinner"], settleMs: 300 },

  // index.html reads `demo-theme` from localStorage before first paint, so the scan sets the
  // same key before boot instead of forcing the attribute on <html>.
  themes: { values: ["light", "dark"], apply: { localStorage: "demo-theme" } },

  // POSTs the credentials and hands back the cookie the app expects. The client reads the
  // cookie itself before asking the server, so it has to be a real cookie in the browser --
  // which is what every engine gets.
  auth: {
    async signIn({ baseUrl, user, pass }) {
      const res = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass })
      });
      if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
      const { token } = await res.json();
      return { cookies: [{ name: "demo-session", value: token }] };
    }
  },

  // The dialog only exists after a click, so a first-paint scan would never see it.
  states: [
    {
      page: "/",
      label: "dialog",
      steps: [{ click: "#open-dialog", waitFor: '[role="dialog"]' }]
    }
  ],

  // Nothing yet. A needs-review item checked by hand goes here -- see docs/reading-results.md.
  acknowledged: []
});
