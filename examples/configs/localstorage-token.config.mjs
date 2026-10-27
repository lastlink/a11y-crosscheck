/**
 * An app that keeps its access token in localStorage and sends it as a bearer header, follows
 * the OS colour scheme rather than offering a picker, and marks itself ready explicitly.
 */
export default {
  baseUrl: "http://localhost:3000",
  pages: ["/", "/dashboard", "/reports", "/settings/profile"],

  // The app sets <html data-ready> once its first data load settles -- the most reliable
  // ready signal there is, if you can add one. `check` is any expression evaluated in the page.
  ready: { check: "document.documentElement.hasAttribute('data-ready')", settleMs: 300 },

  // No picker: the app follows prefers-color-scheme, so the scan emulates the media query.
  themes: { values: ["light", "dark"], apply: "prefers-color-scheme" },

  // A phone and a tablet instead of the default desktop + phone.
  viewports: {
    desktop: { width: 1440, height: 900, mobile: false },
    tablet: { width: 820, height: 1180, mobile: true },
    phone: { width: 390, height: 844, mobile: true }
  },

  auth: {
    async signIn({ baseUrl, user, pass }) {
      const res = await fetch(`${baseUrl}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password", username: user, password: pass })
      });
      if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
      const { access_token } = await res.json();
      return {
        // what the app reads on boot -- reaches the axe run only
        localStorage: { "auth.token": access_token },
        // what the API checks -- reaches all three engines
        headers: { Authorization: `Bearer ${access_token}` }
      };
    }
  },

  // Only the 2.x AA rules -- no best-practice -- while working through a first backlog.
  axe: { tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },

  // HTML_CodeSniffer's AAA set, for a team that has cleared AA.
  pa11y: { standard: "WCAG2AAA" }
};
