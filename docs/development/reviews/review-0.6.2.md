# Reviews

Date: Jun 7, 2026
Version: 0.6.2
Commit: df88467
Completed

> **Resolution status (passed).** This is the first **passing** review — the single error that failed
> `review-0.6.1.md` (the standalone runtime's `createElement("style")`) is fixed at the source: the
> runtime now injects CSS via a constructable stylesheet (`adoptedStyleSheets`), no forbidden element
> (Change 37). With it gone there are **0 errors**, so the review no longer fails. Everything below is
> a **warning** or **recommendation** — none of them fails the review — and each is either ⚠️ **kept by
> deliberate decision + documented** (justified) or ℹ️ **false positive** (does not affect the shipped
> plugin). Reproduced locally, now bot-faithful: `npm run lint:obsidian` scans all of `src/` (incl. the
> runtime + dev-bridge non-plugin bundles, Decision 29) and mirrors the bot's severities → **0 errors,
> 11 documented warnings**; `npm run lint:css` → justified `:has`/`!important` warnings only; the
> shipped linter (`npm run lint`) stays unchanged (T9). Registry: Decision 29, Change 37, Feature 39,
> Lesson 18 (CHANGELOG.md / issues.md).

## Releases

- **Pass**: The `main.js` release asset has a verified GitHub artifact attestation.
- **Pass**: The `styles.css` release asset has a verified GitHub artifact attestation.

  > ✅ **No action needed** (Pass). The release workflow attests both assets (Decision 27,
  > `actions/attest-build-provenance@v2`) — the 0.6.0 recommendation is resolved and now verifying.

## Network requests

- **Pass**: No suspicious network patterns found.

  > ✅ **No action needed** (Pass).

## Behavior

- **Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.

  > ⚠️ **Kept (justified, Decision 26).** Backs the F26 Replace-image fuzzy picker — a
  > `FuzzySuggestModal` needs the full image-candidate set up front; already filtered to image
  > extensions at the call site; `getMarkdownFiles()` is used nowhere; no narrower public API exists.
  > Informational recommendation, not a review-failing item.
- **Pass**: **Vault Read**: Reads individual vault files via the Obsidian API (`vault.read`, `vault.cachedRead`)
- **Pass**: **Vault Write**: Creates or modifies vault files via the Obsidian API (`vault.modify`, `vault.create`, etc.)

  > ✅ **No action needed** (Pass). Both go through the Obsidian vault API as intended.

## Source code

- **Warning**: Use 'activeDocument' instead of 'document' for popout window compatibility.
  - src/anchored-submenu.ts:93, src/anchored-submenu.ts:105, src/anchored-submenu.ts:117, src/anchored-submenu.ts:207, src/anchored-submenu.ts:238, src/anchored-submenu.ts:241, src/anchored-submenu.ts:246, src/anchored-submenu.ts:268, src/caption.ts:28, src/class-panel.ts:46, src/class-panel.ts:91, src/class-panel.ts:101, src/class-panel.ts:116, src/class-panel.ts:124, src/crop-editor.ts:188, src/crop-editor.ts:201, src/crop-editor.ts:206, src/crop-editor.ts:211, src/crop-editor.ts:234, src/crop-editor.ts:235, src/crop-editor.ts:252, src/crop-editor.ts:288, src/crop-editor.ts:347, src/crop-editor.ts:348, src/editing-toolbar-integration.ts:156, src/export.ts:47, src/export.ts:113, src/filter-panel.ts:82, src/filter-panel.ts:147, src/filter-panel.ts:149, src/filter-panel.ts:157, src/filter-panel.ts:160, src/filter-panel.ts:165, src/filter-panel.ts:176, src/filter-panel.ts:186, src/filter-panel.ts:189, src/filter-panel.ts:214, src/filter-panel.ts:217, src/filter-panel.ts:221, src/filter-panel.ts:231, src/filter-panel.ts:300, src/live-preview.ts:40, src/live-preview.ts:43, src/live-preview.ts:76, src/live-preview.ts:120, src/live-preview.ts:134, src/live-preview.ts:142, src/live-preview.ts:146, src/live-preview.ts:188, src/live-preview.ts:200, src/live-preview.ts:225, src/live-preview.ts:236, src/live-preview.ts:237, src/live-preview.ts:243, src/live-preview.ts:244, src/main.ts:119, src/main.ts:140, src/main.ts:147, src/main.ts:148, src/main.ts:413, src/main.ts:445, src/main.ts:462, src/main.ts:478, src/main.ts:481, src/main.ts:1012, src/render-core.ts:289, src/render-core.ts:296, src/render-core.ts:298, src/runtime.ts:42, src/runtime.ts:42, src/runtime.ts:73, src/runtime.ts:78, src/runtime.ts:81, src/runtime.ts:82, src/size-submenu.ts:31, src/size-submenu.ts:34, src/size-submenu.ts:35, src/size-submenu.ts:43, src/size-submenu.ts:56, src/size-submenu.ts:90, src/size-submenu.ts:93, src/styles-injector.ts:39, src/styles-injector.ts:47, src/toolbar.ts:56, src/toolbar.ts:92, src/toolbar.ts:99, src/toolbar.ts:114, src/toolbar.ts:130, src/toolbar.ts:131, src/toolbar.ts:134, src/toolbar.ts:135, src/toolbar.ts:140, src/toolbar.ts:166, src/toolbar.ts:175, src/toolbar.ts:180, src/toolbar.ts:186, src/toolbar.ts:198, src/toolbar.ts:260, src/ui.ts:4

  > ⚠️ **Deferred → Feature 39 (Decision 29).** Warning-level (does not fail the review). Converting
  > every `document`/`window` to `activeDocument`/`activeWindow` is large, cross-cutting, popout-only
  > churn with real regression risk; tracked as the popout-support feature and kept off in the gate by
  > deliberate decision (not suppression).
- **Warning**: Do not import Node.js builtin module "net"
  - src/dev-bridge.ts:2

  > ℹ️ **False positive, kept (Decision 25/29).** Dev-only CDP relay; its single caller is behind
  > `if (__LIE_DEV__)`, so the whole module + its `net` import is tree-shaken out of production — never
  > ships in `main.js`. Now scanned by the bot-faithful gate and surfaced as a documented warning.
- **Warning**: Use '.instanceOf(HTMLImageElement)' instead of 'instanceof HTMLImageElement' for cross-window safe type checking.
  - src/runtime.ts:48, src/runtime.ts:51
- **Warning**: Use '.instanceOf(Element)' instead of 'instanceof Element' for cross-window safe type checking.
  - src/runtime.ts:49
- **Warning**: Use '.instanceOf(Document)' instead of 'instanceof Document' for cross-window safe type checking.
  - src/runtime.ts:49

  > ℹ️ **False positive, kept (Decision 25/29).** `.instanceOf()` is an Obsidian API helper; `runtime.ts`
  > is the framework-free off-Obsidian bundle (`lie-runtime.js`) and imports no `obsidian`, so the helper
  > does not exist there — raw `instanceof` against standard DOM is correct. Warning-level; surfaced as a
  > documented warning.
- **Warning**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/settings.ts:55, src/settings.ts:283

  > ⚠️ **Kept (Decision 26).** `setDestructive()` is **1.13.0-only**; `minAppVersion` is 1.12.7, so a
  > blind switch would break destructive styling on 1.12.x. `setWarning` still works — warning-level.
  > Switch over when minAppVersion is raised.
- **Warning**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/settings.ts:240, src/settings.ts:269, src/settings.ts:307, src/settings.ts:367

  > ⚠️ **Kept (Decision 26).** `getSettingDefinitions` is **1.13.0-only**; `display()` is Obsidian's own
  > sanctioned fallback for `<1.13.0` (our minAppVersion 1.12.7), and the declarative API would be a
  > large rework of our imperative, async-scanning settings UI. Warning-level.

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - styles.css:176, styles.css:344, styles.css:345, styles.css:377, styles.css:385, styles.css:413, styles.css:451, styles.css:524

  > ⚠️ **Kept (justified, Decision 26).** Each `!important` overrides an Obsidian-core or
  > dynamically-gated rule (the crop `contain:none` beating app.css' `contain:paint !important`, the
  > tall-float cap, the dismissed/native reveal). Audited; the one removable defensive `!important` was
  > already dropped in Change 36. Warning-level.
- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:192, styles.css:193, styles.css:194, styles.css:195, styles.css:198, styles.css:199, styles.css:274, styles.css:275, styles.css:276, styles.css:277, styles.css:342, styles.css:343, styles.css:384, styles.css:385

  > ⚠️ **Kept (justified, Decision 26/28).** Alignment/float/reveal must style a flow-participant
  > **ancestor** (the embed / Obsidian's own `.cm-line`/`.cm-formatting`) from a marker on a
  > **descendant** — the only CSS-only mechanism (AD5 forbids reactive JS). The removable `:has` were
  > dropped in Change 36; the runtime is `:has`-free. Target env is Electron/Chromium (full support).
  > Warning-level.

## Dependencies

- **Pass**: No vulnerable dependencies found.

  > ✅ **No action needed** (Pass). T1 — no runtime dependencies; CodeMirror packages are devDependencies
  > only (esbuild externals, nothing bundled).
