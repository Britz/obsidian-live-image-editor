import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

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

if (pluginDir) {
  fs.mkdirSync(pluginDir, { recursive: true });
  // manifest.json / styles.css are not part of the JS bundle; copy them once.
  for (const file of ["manifest.json", "styles.css"]) {
    fs.copyFileSync(file, path.join(pluginDir, file));
  }
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
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}
