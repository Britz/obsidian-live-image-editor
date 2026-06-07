# Reviews
Date: Jun 7, 2026
Version: 0.6.1
Commit: 70e4714
Failed

> **Resolution status (→ v0.6.2).** The review failed on **one** error — the standalone runtime's
> `<style>` element (`runtime.ts:32`). It is now fixed at the source (the runtime injects CSS via a
> constructable stylesheet, `adoptedStyleSheets`), so the review no longer fails. v0.6.1 had
> EXCLUDED `runtime.ts`/`dev-bridge.ts` from our local recreation as "false positives" — but the bot
> scans them, so the exclusion only hid the failure (Lesson 18). The recreation is now bot-faithful
> (`npm run lint:obsidian` scans all of `src/`, mirrors the bot's severities → **0 errors**, 11
> documented warnings). Everything else below is a warning/recommendation that does not fail the
> review and is kept by deliberate decision (Decision 26). Status per item is inlined below.
> Registry: Decision 29, Change 37, Feature 39, Lesson 18 (CHANGELOG.md / issues.md).

## Releases

- **Pass**: The `main.js` release asset has a verified GitHub artifact attestation.
- **Pass**: The `styles.css` release asset has a verified GitHub artifact attestation.

## Network requests

- **Pass**: No suspicious network patterns found.

## Behavior

- **Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.
  - ⚠️ **Kept (justified, Decision 26).** Backs the F26 Replace-image fuzzy picker — a `FuzzySuggestModal` needs the full image-candidate set up front; already filtered to image extensions; no narrower public API. Not a review-failing item.
- **Pass**: **Vault Read**: Reads individual vault files via the Obsidian API (`vault.read`, `vault.cachedRead`)
- **Pass**: **Vault Write**: Creates or modifies vault files via the Obsidian API (`vault.modify`, `vault.create`, etc.)

## Source code

- **Error**: Creating and attaching "style" elements is not allowed. For loading CSS, use a "styles.css" file instead, which Obsidian loads for you.
  - src/runtime.ts:32
  - ✅ **Fixed (Change 37).** The standalone runtime (`lie-runtime.js`, a foreign-page bundle with no Obsidian-loaded stylesheet) no longer does `createElement("style")`; it injects via `new CSSStyleSheet()` + `document.adoptedStyleSheets` — the rule-clean equivalent. This was the ONLY error and the only thing failing the review. Guarded by `tests/unit/runtime-style-injection.test.ts` + `lint:obsidian` now scanning `runtime.ts`.
- **Warning**: Use 'activeDocument' instead of 'document' for popout window compatibility.
  - src/anchored-submenu.ts:93, … (≈97 sites across many files)
  - ⚠️ **Deferred → Feature 39 (Decision 29).** Warning-level (does not fail the review); converting every `document`/`window` to `activeDocument`/`activeWindow` is large, cross-cutting, popout-only churn with real regression risk. Tracked as the popout-support feature, kept off in the gate by deliberate decision (not suppression).
- **Warning**: Do not import Node.js builtin module "net"
  - src/dev-bridge.ts:2
  - ⚠️ **False positive, kept (Decision 25/29).** Dev-only CDP relay; the single caller is behind `if (__LIE_DEV__)`, so the whole module + its `net` import is tree-shaken out of production. Never ships in `main.js`. Now scanned by the gate and surfaced as a documented warning.
- **Warning**: Use '.instanceOf(HTMLImageElement)' / '.instanceOf(Element)' / '.instanceOf(Document)' instead of 'instanceof …' for cross-window safe type checking.
  - src/runtime.ts:41, 42, 44
  - ⚠️ **False positive, kept (Decision 25/29).** The `.instanceOf()` helper is an Obsidian API; `runtime.ts` imports no `obsidian` (it's the framework-free off-Obsidian bundle), so the helper does not exist there. Raw `instanceof` is correct. Warning-level. Now surfaced as a documented warning.
- **Warning**: `setWarning` is deprecated. Use `setDestructive()` / `setDestructive().setCta()`.
  - src/settings.ts:55, 283
  - ⚠️ **Kept (Decision 26).** Replacement is 1.13.0-only; `minAppVersion` is 1.12.7. Warning-level.
- **Warning**: `display` is deprecated. Since 1.13.0. Use `getSettingDefinitions` instead.
  - src/settings.ts:240, 269, 307, 367
  - ⚠️ **Kept (Decision 26).** `getSettingDefinitions` is 1.13.0-only; `display()` is the officially-sanctioned <1.13.0 fallback at `minAppVersion` 1.12.7. Warning-level.

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - styles.css:176, 344, 345, 377, 385, 413, 451, 524
  - ⚠️ **Kept (justified, Decision 26).** Each overrides Obsidian-core / dynamically-gated rules (the crop `contain:none` beating app.css `contain:paint !important`, the tall-float cap, the dismissed reveal). Audited; the one removable defensive `!important` was already dropped in Change 36. Warning-level.
- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:192, 193, 194, 195, 198, 199, 274, 275, 276, 277, 342, 343, 384, 385
  - ⚠️ **Kept (justified, Decision 26/28).** Alignment/float/reveal must style a flow-participant ANCESTOR from a marker on a DESCENDANT (the embed / Obsidian's own `.cm-line`/`.cm-formatting`) — the only CSS-only mechanism (AD5 forbids reactive JS). The removable `:has` were dropped in Change 36; the runtime is `:has`-free. Warning-level.

## Dependencies

- **Pass**: No vulnerable dependencies found.
