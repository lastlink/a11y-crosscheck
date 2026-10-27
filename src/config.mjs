/**
 * Turns the project's a11y.config.mjs plus the command line into one plan the engines run.
 *
 * Everything that is specific to an app lives in the config: which routes exist, how to tell
 * that a route has actually rendered, how to sign in, how a theme is chosen, which dialogs to
 * open. The engines know none of it. See docs/wiring.md for every field.
 *
 * The command line narrows or retargets a config; it never has to repeat it. Any flag the
 * scanner does not know is still handed to the config (as `args`), so a project can add its
 * own -- e.g. `--book=` for a reader route that needs a document to point at.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ALL_ENGINES = ["axe", "pa11y", "lighthouse"];

const CONFIG_NAMES = ["a11y.config.mjs", "a11y.config.js"];

/** 1366x900 is a laptop; 390x844 is a phone in portrait, where layouts genuinely differ. */
const DEFAULT_VIEWPORTS = {
  desktop: { width: 1366, height: 900, mobile: false },
  phone: { width: 390, height: 844, mobile: true }
};

/**
 * WCAG 2.0, 2.1 and 2.2 A/AA plus best-practice. 2.2 brings `target-size` (2.5.8), which
 * matters for phone layouts.
 */
const DEFAULT_AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/**
 * WCAG 2.5.3 Label in Name (Level A). axe tags it experimental and skips it by default;
 * Lighthouse turns it on. Where Lighthouse cannot reach a route (signed-in pages, dialogs),
 * nothing would check the rule there without this.
 */
const DEFAULT_AXE_RULES = { "label-content-name-mismatch": { enabled: true } };

/**
 * Split argv into flags. Splits on the first "=" only: a route can carry its own query string
 * (`--pages=/viewer/?doc=a.pdf`), and splitting on every one cuts it down to `/viewer/?doc`.
 */
export function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      const flag = a.replace(/^--/, "");
      const at = flag.indexOf("=");
      return at === -1 ? [flag, true] : [flag.slice(0, at), flag.slice(at + 1)];
    })
  );
}

const list = (v) =>
  String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

async function readConfig(args) {
  const explicit = typeof args.config === "string" ? path.resolve(args.config) : null;
  const file = explicit || CONFIG_NAMES.map((n) => path.resolve(n)).find((f) => existsSync(f));
  if (!file) {
    // A config is optional: with none, the scan is "these pages, as they are" -- enough for a
    // static site, and a fair first look at anything else.
    return { file: null, config: {} };
  }
  if (!existsSync(file)) throw new Error(`config not found: ${file}`);
  const mod = await import(pathToFileURL(file).href);
  const exported = mod.default ?? mod;
  const config = typeof exported === "function" ? await exported({ args }) : exported;
  return { file, config: config || {} };
}

/**
 * How a theme is applied before the app boots. Returns the source of a script that runs at
 * the start of every document, or null when the theme is applied another way (emulated media).
 */
function themeScript(apply, theme) {
  if (!apply) return null;
  if (typeof apply === "function") return apply(theme);
  if (apply.localStorage) {
    return `try { localStorage.setItem(${JSON.stringify(apply.localStorage)}, ${JSON.stringify(theme)}); } catch {}`;
  }
  return null;
}

export async function loadPlan(argv) {
  const args = parseArgs(argv);
  const { file, config } = await readConfig(args);

  // --url wins over --port, which wins over the config, so the same config can target a dev
  // server, a served build, or production.
  const base = (
    args.url
      ? String(args.url)
      : args.port
        ? `http://localhost:${args.port}`
        : config.baseUrl || "http://localhost:5173"
  ).replace(/\/+$/, "");

  /** Filesystem-safe site label: drop the scheme, and lose ':' and '/' which break paths. */
  const site = base
    .replace(/^https?:\/\//, "")
    .replace(/:/g, "_")
    .replace(/[/\\]/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_");

  const engines = args.only ? list(args.only) : ALL_ENGINES;
  const unknown = engines.filter((e) => !ALL_ENGINES.includes(e));
  if (unknown.length) throw new Error(`unknown engine(s): ${unknown.join(", ")}`);

  const pages = args.pages ? list(args.pages) : config.pages || ["/"];

  const themeCfg = config.themes || {};
  const themeValues = args.themes
    ? list(args.themes)
    : themeCfg.values || [themeCfg.default || "default"];

  const viewports = config.viewports || DEFAULT_VIEWPORTS;
  const viewportNames = args.viewports ? list(args.viewports) : Object.keys(viewports);
  for (const v of viewportNames) {
    if (!viewports[v]) throw new Error(`unknown viewport: ${v} (have ${Object.keys(viewports).join(", ")})`);
  }

  // The "default variant" is what interactive states run in, and the one whose run key is the
  // bare page path -- so a run narrowed to one theme and one viewport reads like a plain list.
  const defaultTheme = themeCfg.default || themeValues[0];
  const defaultViewport = viewportNames[0];

  const states = args.states === "off" ? [] : config.states || [];

  const runs = [];
  for (const page of pages) {
    for (const theme of themeValues) {
      for (const viewport of viewportNames) {
        const plain = theme === defaultTheme && viewport === defaultViewport;
        runs.push({
          key: plain ? page : `${page} [${theme}, ${viewport}]`,
          page,
          theme,
          viewport
        });
      }
    }
  }
  for (const state of states) {
    if (!pages.includes(state.page)) continue;
    runs.push({
      key: `${state.page} <${state.label}>`,
      page: state.page,
      theme: defaultTheme,
      viewport: defaultViewport,
      steps: state.steps,
      label: state.label
    });
  }

  // Credentials from --login=user:pass or A11Y_USER / A11Y_PASS. The password may contain ':'.
  const raw = args.login === true ? "" : String(args.login || "");
  const [user, ...rest] = raw.split(":");
  const login = {
    user: user || process.env.A11Y_USER || "",
    pass: rest.join(":") || process.env.A11Y_PASS || ""
  };

  const out = path.resolve(String(args.out || config.out || path.join("reports", "a11y")));
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

  return {
    args,
    configFile: file,
    base,
    site,
    engines,
    pages,
    themes: {
      values: themeValues,
      emulateColorScheme: themeCfg.apply === "prefers-color-scheme",
      script: (theme) => themeScript(themeCfg.apply, theme)
    },
    viewports,
    viewportNames,
    runs,
    ready: {
      root: "body",
      busy: [],
      requireText: true,
      settleMs: 1000,
      timeoutMs: 30000,
      ...(config.ready || {})
    },
    auth: config.auth || null,
    login,
    axe: {
      tags: config.axe?.tags || DEFAULT_AXE_TAGS,
      rules: { ...DEFAULT_AXE_RULES, ...(config.axe?.rules || {}) }
    },
    pa11y: { standard: "WCAG2AA", ...(config.pa11y || {}) },
    acknowledged: config.acknowledged || [],
    out,
    stamp
  };
}
