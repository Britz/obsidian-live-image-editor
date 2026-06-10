# Reviews

Date: Jun 7, 2026
Version: 0.6.5
Commit: 4e8eb8c
Completed

> **Resolution status (passed).** A clean **passing** review — **0 errors**. The six-state layout
> rework, the editing-toolbar reseat and the cmd+Z / block-line / submenu-migration fixes that landed
> across 0.6.4–0.6.5 introduced **no new error class**; the warning/recommendation set is unchanged from
> the passing v0.6.2 re-review (only line numbers shifted with the edits), and each item is carried
> forward with the same adjudication: ⚠️ **kept by deliberate decision + documented** (justified, does
> not fail the review) or ℹ️ **false positive** (does not affect the shipped plugin). Reproduced locally,
> bot-faithful (Decision 29): `npm run lint:obsidian` → **0 errors, 11 documented warnings**;
> `npm run lint:css` → justified `:has`/`!important` warnings only; the shipped linter (`npm run lint`)
> stays unchanged (T9). Registry: Decision 29, Change 37, Feature 39, Lesson 18 (CHANGELOG.md /
> issues.md).

## Releases

- **Pass**: The `main.js` release asset has a verified GitHub artifact attestation.
- **Pass**: The `styles.css` release asset has a verified GitHub artifact attestation.

  > ✅ **No action needed** (Pass). The release workflow attests both assets (Decision 27).

## Network requests

- **Pass**: No suspicious network patterns found.

  > ✅ **No action needed** (Pass).

## Behavior

- **Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.

  > ⚠️ **Kept (justified, Decision 26).** Backs the F26 Replace-image fuzzy picker — a
  > `FuzzySuggestModal` needs the full image-candidate set up front; filtered to image extensions; no
  > narrower public API. Informational recommendation, not a review-failing item.
- **Pass**: **Vault Read**: Reads individual vault files via the Obsidian API (`vault.read`, `vault.cachedRead`)
- **Pass**: **Vault Write**: Creates or modifies vault files via the Obsidian API (`vault.modify`, `vault.create`, etc.)

  > ✅ **No action needed** (Pass). Both go through the Obsidian vault API as intended.

## Source code

- **Warning**: Use 'activeDocument' instead of 'document' for popout window compatibility.
  - src/anchored-submenu.ts:93, src/anchored-submenu.ts:105, src/anchored-submenu.ts:117, src/anchored-submenu.ts:207, src/anchored-submenu.ts:238, src/anchored-submenu.ts:241, src/anchored-submenu.ts:246, src/anchored-submenu.ts:268, src/caption.ts:28, src/class-panel.ts:46, src/class-panel.ts:91, src/class-panel.ts:101, src/class-panel.ts:116, src/class-panel.ts:124, src/crop-editor.ts:188, src/crop-editor.ts:201, src/crop-editor.ts:206, src/crop-editor.ts:211, src/crop-editor.ts:234, src/crop-editor.ts:235, src/crop-editor.ts:252, src/crop-editor.ts:288, src/crop-editor.ts:347, src/crop-editor.ts:348, src/editing-toolbar-integration.ts:157, src/export.ts:47, src/export.ts:113, src/filter-panel.ts:82, src/filter-panel.ts:147, src/filter-panel.ts:149, src/filter-panel.ts:157, src/filter-panel.ts:160, src/filter-panel.ts:165, src/filter-panel.ts:176, src/filter-panel.ts:186, src/filter-panel.ts:189, src/filter-panel.ts:214, src/filter-panel.ts:217, src/filter-panel.ts:221, src/filter-panel.ts:231, src/filter-panel.ts:300, src/live-preview.ts:40, src/live-preview.ts:43, src/live-preview.ts:76, src/live-preview.ts:120, src/live-preview.ts:134, src/live-preview.ts:142, src/live-preview.ts:146, src/live-preview.ts:188, src/live-preview.ts:200, src/live-preview.ts:225, src/live-preview.ts:236, src/live-preview.ts:237, src/live-preview.ts:243, src/live-preview.ts:244, src/main.ts:129, src/main.ts:150, src/main.ts:157, src/main.ts:158, src/main.ts:423, src/main.ts:455, src/main.ts:472, src/main.ts:488, src/main.ts:491, src/main.ts:1029, src/render-core.ts:290, src/render-core.ts:297, src/render-core.ts:299, src/runtime.ts:44, src/runtime.ts:44, src/runtime.ts:75, src/runtime.ts:80, src/runtime.ts:83, src/runtime.ts:84, src/size-submenu.ts:30, src/size-submenu.ts:33, src/size-submenu.ts:34, src/size-submenu.ts:42, src/size-submenu.ts:54, src/size-submenu.ts:87, src/size-submenu.ts:90, src/styles-injector.ts:39, src/styles-injector.ts:47, src/toolbar.ts:61, src/toolbar.ts:98, src/toolbar.ts:105, src/toolbar.ts:120, src/toolbar.ts:136, src/toolbar.ts:137, src/toolbar.ts:140, src/toolbar.ts:141, src/toolbar.ts:146, src/toolbar.ts:172, src/toolbar.ts:181, src/toolbar.ts:186, src/toolbar.ts:192, src/toolbar.ts:204, src/toolbar.ts:266, src/ui.ts:4

  > ⚠️ **Deferred → Feature 39 (Decision 29).** Warning-level; popout-only, cross-cutting churn with
  > real regression risk. Tracked as the popout-support feature, kept off in the gate by deliberate
  > decision (not suppression).
- **Warning**: Do not import Node.js builtin module "net"
  - src/dev-bridge.ts:2

  > ℹ️ **False positive, kept (Decision 25/29).** Dev-only CDP relay behind `if (__LIE_DEV__)` —
  > tree-shaken out of production, never ships in `main.js`. Documented warning.
- **Warning**: Use '.instanceOf(HTMLImageElement)' instead of 'instanceof HTMLImageElement' for cross-window safe type checking.
  - src/runtime.ts:50, src/runtime.ts:53
- **Warning**: Use '.instanceOf(Element)' instead of 'instanceof Element' for cross-window safe type checking.
  - src/runtime.ts:51
- **Warning**: Use '.instanceOf(Document)' instead of 'instanceof Document' for cross-window safe type checking.
  - src/runtime.ts:51

  > ℹ️ **False positive, kept (Decision 25/29).** `.instanceOf()` is an Obsidian helper; `runtime.ts` is
  > the framework-free off-Obsidian bundle and imports no `obsidian`, so raw `instanceof` against
  > standard DOM is correct. Documented warning.
- **Warning**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/settings.ts:55, src/settings.ts:283

  > ⚠️ **Kept (Decision 26).** `setDestructive()` is 1.13.0-only; `minAppVersion` is 1.12.7. `setWarning`
  > still works — warning-level. Switch when minAppVersion is raised.
- **Warning**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/settings.ts:240, src/settings.ts:269, src/settings.ts:307, src/settings.ts:367

  > ⚠️ **Kept (Decision 26).** `getSettingDefinitions` is 1.13.0-only; `display()` is Obsidian's
  > sanctioned `<1.13.0` fallback (our minAppVersion 1.12.7). Warning-level.

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - styles.css:183, styles.css:365, styles.css:366, styles.css:398, styles.css:406, styles.css:434, styles.css:472, styles.css:545

  > ⚠️ **Kept (justified, Decision 26).** Each overrides an Obsidian-core / dynamically-gated rule (crop
  > `contain:none` vs app.css' `contain:paint !important`, tall-float cap, dismissed/native reveal).
  > Audited; the one removable defensive `!important` was dropped in Change 36. Warning-level.
- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:200, styles.css:201, styles.css:202, styles.css:203, styles.css:212, styles.css:213, styles.css:214, styles.css:215, styles.css:216, styles.css:217, styles.css:218, styles.css:219, styles.css:220, styles.css:295, styles.css:296, styles.css:297, styles.css:298, styles.css:363, styles.css:364, styles.css:405, styles.css:406

  > ⚠️ **Kept (justified, Decision 26/28).** The only CSS-only way to style a flow-participant
  > **ancestor** from a marker on a **descendant** (AD5 forbids reactive JS); runtime is `:has`-free;
  > Electron/Chromium target has full support. The extra hits vs 0.6.2 are the new six-state layout
  > selectors (same justified form). Warning-level.

## Dependencies

- **Pass**: No vulnerable dependencies found.

  > ✅ **No action needed** (Pass). T1 — no runtime dependencies; CodeMirror is devDependencies only.
