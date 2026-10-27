// A deliberately small single-page app, shaped like a real one where it matters to a scanner:
// it mounts into #app after a fetch, shows a spinner meanwhile, gates a route behind a session,
// and opens a dialog only on click.
const app = document.getElementById("app");
const broken = !!window.DEMO_BROKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const routes = {
  "/": home,
  "/about": about,
  "/account": account
};

function layout(title, content) {
  document.title = `${title} - Demo app`;
  app.innerHTML = `
    <a href="#main" class="skip">Skip to content</a>
    <header>
      <strong>Demo app</strong>
      <nav aria-label="Main">
        <a href="/">Home</a> <a href="/about">About</a> <a href="/account">Account</a>
      </nav>
    </header>
    <main id="main" tabindex="-1"><h1>${title}</h1>${content}</main>`;
}

function home() {
  layout(
    "Home",
    `<p>A tiny app for showing how a scan is wired up.</p>
     ${broken ? '<p class="faint">This line is too faint to read.</p><input placeholder="Search">' : ""}
     <button id="open-dialog" type="button">Open dialog</button>`
  );
  document.getElementById("open-dialog").addEventListener("click", openDialog);
}

function openDialog() {
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = broken
    ? `<div role="dialog" aria-modal="true">
         <p>Changes saved.</p>
         <button id="close-dialog" type="button"><svg width="12" height="12" aria-hidden="true"><path d="M0 0L12 12M12 0L0 12" stroke="currentColor"/></svg></button>
       </div>`
    : `<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
         <h2 id="dialog-title">Saved</h2>
         <p>Changes saved.</p>
         <button id="close-dialog" type="button">Close</button>
       </div>`;
  document.body.append(backdrop);
  const close = backdrop.querySelector("#close-dialog");
  close.addEventListener("click", () => backdrop.remove());
  close.focus();
}

function about() {
  layout("About", `<p class="muted">Served by examples/demo/serve.mjs.</p>`);
}

async function account() {
  // Like many SPAs, the client decides it is signed in from its own state (here a cookie it
  // can read) before asking the server -- so a Cookie *header* alone would not sign a scan in.
  const me = document.cookie.includes("demo-session=")
    ? await fetch("/api/me").then((r) => (r.ok ? r.json() : null))
    : null;
  if (me) {
    layout(
      "Account",
      `<p>Signed in as ${me.name}.</p>
       ${broken ? '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="48" height="48">' : ""}`
    );
    return;
  }
  layout(
    "Sign in",
    `<form id="login">
       <label for="user">User name</label><input id="user" type="text" autocomplete="username">
       <label for="pass">Password</label><input id="pass" type="password" autocomplete="current-password">
       <p><button type="submit">Sign in</button></p>
     </form>`
  );
  document.getElementById("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: e.target.user.value, pass: e.target.pass.value })
    });
    if (!res.ok) return;
    const { token } = await res.json();
    document.cookie = `demo-session=${token}; path=/`;
    render();
  });
}

async function render() {
  app.innerHTML = '<div class="spinner" role="status">Loading...</div>';
  // stands in for the bootstrap fetch every real app does before it can draw anything
  await sleep(400);
  await (routes[location.pathname] || home)();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='/']");
  if (!a) return;
  e.preventDefault();
  history.pushState(null, "", a.getAttribute("href"));
  render();
});
addEventListener("popstate", render);
render();
