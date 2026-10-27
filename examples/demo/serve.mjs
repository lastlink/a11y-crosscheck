/**
 * A dependency-free server for the demo SPA -- just enough of a real app to wire a scan to:
 *
 *   - every non-file path answers with index.html, and the client renders the route
 *   - POST /api/login { user, pass } -> { token }    (demo / demo)
 *   - GET  /api/me                      -> 200 with the session cookie, 401 without
 *
 * DEMO_BROKEN=1 serves the same app with a few deliberate failures, so there is something
 * for the reports to show.
 *
 *   node examples/demo/serve.mjs          # http://localhost:4173
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");
const TOKEN = "demo-token";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const hasSession = (req) =>
  (req.headers.cookie || "").split(/;\s*/).includes(`demo-session=${TOKEN}`);

async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function start({
  port = Number(process.env.PORT) || 4173,
  broken = !!process.env.DEMO_BROKEN
} = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (url.pathname === "/api/login" && req.method === "POST") {
      const { user, pass } = await body(req);
      return user === "demo" && pass === "demo"
        ? json(200, { token: TOKEN, name: "Demo User" })
        : json(401, { error: "bad credentials" });
    }
    if (url.pathname === "/api/me") {
      return hasSession(req) ? json(200, { name: "Demo User" }) : json(401, { error: "signed out" });
    }

    const ext = path.extname(url.pathname);
    const file = ext ? path.join(SITE, path.normalize(url.pathname)) : path.join(SITE, "index.html");
    if (!file.startsWith(SITE)) return json(403, { error: "forbidden" });
    try {
      let content = await readFile(file, "utf8");
      if (file.endsWith("index.html") && broken) {
        content = content.replace("<head>", "<head><script>window.DEMO_BROKEN = true;</script>");
      }
      res.writeHead(200, { "Content-Type": TYPES[ext || ".html"] || "text/plain" });
      res.end(content);
    } catch {
      json(404, { error: "not found" });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await start();
  console.log(`demo app on http://localhost:${server.address().port}  (sign in: demo / demo)`);
}
