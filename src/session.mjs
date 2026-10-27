/**
 * Signing in, so a scan sees the app rather than its login form.
 *
 * Without a session every gated route redirects to the login form, and the scan grades the
 * same screen once per route -- which reports clean and means nothing.
 *
 * How an app keeps a session is the app's business, so the config's `auth.signIn` does the
 * actual sign-in and returns whatever the app reads back on load:
 *
 *   { cookies:      [{ name, value, path?, domain?, httpOnly?, secure? }],
 *     localStorage: { key: value },
 *     headers:      { Authorization: "Bearer ..." } }
 *
 * Any combination. Every engine's browser gets all of it before the app boots.
 */

/** @returns {Promise<null | {cookies: object[], localStorage: object, headers: object}>} */
export async function signIn(plan) {
  const { login, auth, base } = plan;
  if (!login.user) return null;
  if (!auth?.signIn) {
    throw new Error(
      "credentials were given (--login or A11Y_USER), but the config has no auth.signIn " +
        "to use them with. See docs/wiring.md#signing-in."
    );
  }
  const session = await auth.signIn({ baseUrl: base, user: login.user, pass: login.pass });
  if (!session) throw new Error(`sign-in for "${login.user}" returned no session`);
  return {
    cookies: session.cookies || [],
    localStorage: session.localStorage || {},
    headers: session.headers || {}
  };
}
