import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// A SEPARATE, dev-only lint pass that RECREATES the Obsidian community-plugin review
// (`eslint-plugin-obsidianmd` recommended ruleset). It is intentionally NOT the shipped lint
// gate — `eslint.config.mjs` (run by `npm run lint`) is kept as-is per requirement T9. Run this
// pass with `npm run lint:obsidian`.
//
// Scope = the PLUGIN source (what compiles into main.js). The two files that are NOT the plugin
// bundle are excluded: the standalone portable runtime (`src/runtime.ts` → `lie-runtime.js`, a
// framework-free bundle for foreign non-Obsidian pages) and the dev-only CDP bridge
// (`src/dev-bridge.ts`, tree-shaken out of production via __LIE_DEV__). Off-Obsidian / in dev they
// legitimately need `createElement("style")` / raw `instanceof` / a `net` import; the review bot
// flags them, but those are FALSE POSITIVES for the shipped plugin (Decision 25 — documented).
// They are NOT silenced with inline `eslint-disable` comments because those would reference
// obsidianmd rule names the SHIPPED linter (eslint.config.mjs) doesn't know, breaking `npm run lint`
// — and T9 requires the shipped linter be kept exactly as-is. Excluding here is the T9-safe option.
export default defineConfig([
  { ignores: ["src/runtime.ts", "src/dev-bridge.ts"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      // `__LIE_DEV__` is an esbuild `define` (env.d.ts declares the ambient); declare it here so
      // no-undef doesn't fire on the dev-bridge gate in main.ts (a recreation-only artifact).
      globals: { __LIE_DEV__: "readonly" },
    },
    rules: {
      // The review BOT does not flag prefer-active-doc; converting every `document` →
      // `activeDocument` is large churn for popout-window support tracked separately. Off here so
      // this pass mirrors what the bot actually enforces (Decision 25).
      "obsidianmd/prefer-active-doc": "off",
      // `setWarning()` / `PluginSettingTab.display()` are @deprecated since 1.13.0, but their
      // replacements (`setDestructive` / `getSettingDefinitions`) are 1.13.0-only and the plugin
      // targets minAppVersion 1.12.7 (display() is the officially-sanctioned <1.13.0 fallback).
      // The bot reports these as warnings, so do we — kept by deliberate decision (Decision 26).
      "@typescript-eslint/no-deprecated": "warn",
    },
  },
]);
