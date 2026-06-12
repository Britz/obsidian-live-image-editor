import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

// Build modes:
//   "production" — minified, no source maps, one-shot build
//   "dev"        — source maps, not minified, one-shot build (for --dev install)
//   (none)       — source maps, not minified, watch mode (npm run dev / dev:vault)
const mode = process.argv[2];
const prod = mode === "production";
const watch = !prod && mode !== "dev";

// In dev mode, optionally write the bundle straight into a vault plugin folder
// so a live-reload plugin (Developer Toolbox) picks it up on each save.
const pluginDir = !prod ? process.env.OBSIDIAN_PLUGIN_DIR : undefined;
const outfile = pluginDir ? path.join(pluginDir, "main.js") : "main.js";

// Keep the vault's manifest.json / styles.css in lockstep with the SOURCE on every build. They
// are not part of the JS bundle, so esbuild's dependency graph never touches them — the old code
// copied them ONCE at startup, so an edited styles.css never reached the vault and Obsidian kept
// serving the stale CSS it had already loaded. That masked real CSS regressions in dev: a clean
// store install rendered the (broken) current CSS, the dirty dev vault rendered an old cached one.
// syncAssets() re-copies whatever differs and reports whether anything changed.
function syncAssets() {
  if (!pluginDir) return false;
  let changed = false;
  for (const file of ["manifest.json", "styles.css"]) {
    const src = fs.readFileSync(file);
    const dest = path.join(pluginDir, file);
    const prev = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    if (prev && prev.equals(src)) continue;
    fs.writeFileSync(dest, src);
    changed = true;
  }
  return changed;
}

// Force the running Obsidian to DROP its in-memory plugin CSS and re-read styles.css from disk.
// A plugin stylesheet is read from the local file (not over HTTP) — there is no cache to "disable",
// only Obsidian's already-injected copy, which a full reload re-reads. Reuses the zero-dep CDP
// client; silently no-ops when Obsidian isn't running with the debug port (relay restarts with it).
function forceReload() {
  const child = spawn(process.execPath, ["scripts/obsidian-debug.mjs", "--eval", "location.reload()"], {
    stdio: "ignore",
  });
  child.on("error", () => {});
}

if (pluginDir) {
  fs.mkdirSync(pluginDir, { recursive: true });
  syncAssets();
  console.log(`dev: writing bundle to ${outfile}`);
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "net",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  define: { __LIE_DEV__: JSON.stringify(!prod) },
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile,
  minify: prod,
  plugins: [
    {
      // After each (re)build, re-sync the non-bundled assets into the vault. A JS rebuild leaves
      // styles.css unchanged, so this never reloads — the CSS reload is driven by the dedicated
      // styles.css watcher below. This just keeps a stale vault copy from lingering.
      name: "lie-dev-asset-sync",
      setup(build) {
        build.onEnd(() => { syncAssets(); });
      },
    },
  ],
});

// The standalone PORTABLE RUNTIME (AB7a) — a SECOND entry → `lie-runtime.js` (always at the
// repo root, not the vault). Framework-free IIFE for a browser, the render CSS inlined (a single
// `<script>` include). NO `obsidian`/CM externals: the runtime imports only the Obsidian-free
// core, so a stray framework import would FAIL this build — the import-discipline guard that
// keeps the runtime bundle from pulling Obsidian.
const runtimeContext = await esbuild.context({
  entryPoints: ["src/runtime.ts"],
  bundle: true,
  format: "iife",
  target: "es2018",
  logLevel: "info",
  define: { __LIE_DEV__: JSON.stringify(!prod) },
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "lie-runtime.js",
  minify: prod,
});

if (watch) {
  await context.watch();
  await runtimeContext.watch();

  // styles.css / manifest.json live OUTSIDE esbuild's JS dependency graph, so a change to them
  // never triggers the watch above. Watch them directly: on a change, re-sync into the vault and
  // force Obsidian to re-read the file — so the dev vault can never drift from source (the fence).
  if (pluginDir) {
    let timer;
    const onAssetChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (syncAssets()) {
          console.log("dev: styles.css/manifest changed → forcing Obsidian to re-read (CDP reload)");
          forceReload();
        }
      }, 100);
    };
    for (const file of ["styles.css", "manifest.json"]) fs.watch(file, onAssetChange);
  }
} else {
  await context.rebuild();
  await runtimeContext.rebuild();
  process.exit(0);
}
