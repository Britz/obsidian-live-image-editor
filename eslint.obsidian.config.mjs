import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// A SEPARATE, dev-only lint pass that RECREATES the Obsidian community-plugin review
// (`eslint-plugin-obsidianmd` recommended ruleset). It is intentionally NOT the shipped lint
// gate — `eslint.config.mjs` (run by `npm run lint`) is kept as-is per requirement T9. Run this
// pass with `npm run lint:obsidian`. Gate criterion: **0 errors** (warnings are documented below).
//
// Scope = ALL of `src/**/*.ts`, exactly like the review bot. Decision 25 originally EXCLUDED the
// standalone runtime (`runtime.ts` → `lie-runtime.js`) and the dev-only CDP bridge
// (`dev-bridge.ts`) as "false positives for the shipped plugin" — but the bot scans them anyway,
// and that exclusion HID a genuine error (`runtime.ts` `createElement("style")`) that kept failing
// the real review (review-0.6.1.md). So we no longer exclude them (Decision 29 / Lesson 18): the
// gate must scan everything the bot scans. The `<style>` error is now fixed at the source (the
// runtime uses `adoptedStyleSheets`); the remaining flags on these two files are genuine,
// warning-level false positives that do NOT fail the review and are kept on purpose:
//   • runtime.ts — raw `instanceof` (it imports no `obsidian`, so the `instanceOf()` helper does
//     not exist off-Obsidian); warning.
//   • dev-bridge.ts — a `net` import (desktop-only dev relay, tree-shaken out of production via
//     `__LIE_DEV__`); warning.
// They are NOT silenced with inline `eslint-disable` comments: those name obsidianmd rules the
// SHIPPED linter doesn't know and break `npm run lint` (T9 / Lesson 17).
export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      // Ambients the recommended ruleset's `no-undef` doesn't otherwise know: `__LIE_DEV__` is an
      // esbuild `define` (env.d.ts declares it), `NodeJS` is the @types/node namespace used in a
      // type position in dev-bridge.ts. Both are recreation-only no-undef artifacts the bot (which
      // resolves the full TS project) never reports — declared so the gate matches the bot.
      globals: { __LIE_DEV__: "readonly", NodeJS: "readonly" },
    },
    rules: {
      // SEVERITY ALIGNMENT — the bot's error set is the only thing that fails the review, so the
      // gate's error set must equal it: rules the BOT reports as WARNINGS are set to "warn" here so
      // "0 errors" locally ⟺ "review won't fail". The recommended ruleset makes several of these
      // hard errors; the bot (review-0.6.1.md) shows them as warnings (Decision 29 — same drift the
      // original pass corrected for `no-deprecated`).
      //
      // The bot flags `prefer-active-doc` (`document` → `activeDocument`) as warnings across ~all
      // files — popout-window correctness, not a review-failing error. Converting every `document`
      // is large, risky churn tracked as Feature 39 (popout support). Kept OFF so this gate stays
      // focused on the ERRORS that actually fail the review (deliberate decision, not suppression).
      "obsidianmd/prefer-active-doc": "off",
      // runtime.ts uses raw `instanceof` — it imports no `obsidian`, so the `instanceOf()` helper
      // does not exist in that off-Obsidian bundle. Bot: warning.
      "obsidianmd/prefer-instanceof": "warn",
      // dev-bridge.ts imports `net` — a desktop-only dev CDP relay, tree-shaken from production via
      // `__LIE_DEV__`. Bot: warning.
      "import/no-nodejs-modules": "warn",
      // `setWarning()` / `PluginSettingTab.display()` are @deprecated since 1.13.0, but their
      // replacements (`setDestructive` / `getSettingDefinitions`) are 1.13.0-only and the plugin
      // targets minAppVersion 1.12.7 (display() is the officially-sanctioned <1.13.0 fallback).
      // The bot reports these as warnings, so do we — kept by deliberate decision (Decision 26).
      "@typescript-eslint/no-deprecated": "warn",
    },
  },
  {
    // The dev-only CDP bridge legitimately logs to the console (a dev relay, tree-shaken out of
    // production); the bot does not surface this, and there is no `console.*` anywhere in the
    // shipped plugin source. Relax the no-console wrapper for this one dev-only file (Decision 29).
    files: ["src/dev-bridge.ts"],
    rules: { "obsidianmd/rule-custom-message": "off" },
  },
]);
