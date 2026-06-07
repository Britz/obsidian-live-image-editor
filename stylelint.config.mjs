// Recreates the Obsidian review BOT's CSS scan, which is SEPARATE from eslint-plugin-obsidianmd
// (that plugin ships no CSS rules). The bot warns on `:has()` (broad selector invalidation / perf)
// and `!important` (makes the plugin's styles hard to override with a snippet). Both are WARNINGS,
// not errors: every occurrence in styles.css is reviewed and justified (Decision 26 —
// architecturally-required ancestor-reacts-to-descendant `:has()` hosts, and `!important`
// overrides of Obsidian-core / dynamically-gated rules). This pass documents the known set rather
// than gating on zero. Run with `npm run lint:css`. Like `lint:obsidian`, it is a dev-only pass and
// is NOT the shipped lint gate (T9 — the project linter is eslint.config.mjs, kept as-is).
export default {
  rules: {
    "declaration-no-important": [true, { severity: "warning" }],
    "selector-disallowed-list": [
      ["/:has\\(/"],
      { severity: "warning", message: ":has() — reviewed & justified (ancestor-from-descendant, Decision 26)" },
    ],
  },
};
