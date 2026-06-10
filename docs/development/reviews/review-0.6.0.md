# Reviews

Date: Jun 6, 2026
Version: 0.6.0
Commit: 05cae28
Failed

> **Resolution status (v0.6.1, 2026-06-07).** Every item below is annotated with a status line:
> ✅ **Fixed** · ⚠️ **Kept by deliberate decision + documented** (justified warning, does not fail the
> review) · ℹ️ **False positive** (does not affect the shipped plugin). Both **errors**
> (static inline styles, injected `<style>`) are genuinely fixed — so the review no longer fails.
> Recreated as a separate dev run: `npm run lint:obsidian` → **0 errors** (6 documented
> deprecation warnings), `npm run lint:css` → 0 errors (justified `:has`/`!important` warnings);
> the shipped linter (`npm run lint`) stays unchanged (T9). Details in `CHANGELOG.md`
> (Decisions 25–27, Changes 33–35, Bug 89) and `docs/development/issues.md` (Lesson 17).

## Releases

- **Recommendation**: Missing GitHub artifact attestations for release assetsmain.js, styles.cssArtifact attestations let users cryptographically verify the provenance of the release assets, proving they were built from the source repository. [Learn more](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)

  > ✅ **Fixed** (Decision 27). `.github/workflows/release.yml` now runs
  > `actions/attest-build-provenance@v2` over `main.js` + `styles.css` (permissions
  > `id-token: write` + `attestations: write`); verifiable with
  > `gh attestation verify <file> -R <owner>/<repo>`. Caveat documented: the attestation is only created in the
  > GitHub-Actions run (OIDC/Sigstore) — the local `gh release create` path of the `/release` skill
  > stays unattested; "CI as the sole publisher" is a separate later decision.

## Network requests

- **Pass**: No suspicious network patterns found.

  > ✅ **No action needed** (Pass).

## Behavior

- **Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.

  > ⚠️ **Kept by deliberate decision** (Decision 26). `vault.getFiles()` in `replace-picker.ts` backs the
  > F26 Replace-image picker: a `FuzzySuggestModal` needs the full candidate list up front.
  > Already filtered to image extensions at the call site; `getMarkdownFiles()` is used nowhere; there
  > is no narrower public API. Informational flag, not a defect — left unchanged.

- Recommendation

  **Local Storage**: Persists data in `localStorage` or `sessionStorage` instead of the Obsidian plugin data APIs

  > ✅ **Fixed** (Change 35). False-positive-ish flag: it was only a **read** of Obsidian's
  > own key `localStorage["language"]` (i18n, F21) — not our own persistence. Replaced with
  > Obsidian's `getLanguage()`. The actual plugin data (settings) goes through
  > `loadData()` / `saveData()` anyway.

- **Pass:** **Vault Read**: Reads individual vault files via the Obsidian API (`vault.read`, `vault.cachedRead`)

  > ✅ **No action needed** (Pass).

- **Pass**: **Vault Write**: Creates or modifies vault files via the Obsidian API (`vault.modify`, `vault.create`, etc.)

  > ✅ **No action needed** (Pass).

## Source code

- **Error**: Sets styles directly instead of using CSS classes or `setCssProps`
  - obsidianmd/no-static-styles-assignment
  - src/anchored-submenu.ts:102, src/anchored-submenu.ts:103, src/anchored-submenu.ts:104, src/anchored-submenu.ts:105, src/anchored-submenu.ts:116, src/anchored-submenu.ts:153, src/crop-editor.ts:165, src/crop-editor.ts:166, src/crop-editor.ts:172, src/crop-editor.ts:251, src/crop-editor.ts:252, src/crop-editor.ts:253, src/crop-editor.ts:257, src/crop-editor.ts:265, src/crop-editor.ts:266, src/crop-editor.ts:266, src/crop-editor.ts:266, src/crop-editor.ts:266, src/crop-editor.ts:267, src/crop-editor.ts:268, src/crop-editor.ts:269, src/crop-editor.ts:270, src/crop-editor.ts:271, src/export.ts:258, src/render-core.ts:110, src/render-core.ts:111, src/render-core.ts:112, src/render-core.ts:113, src/render-core.ts:114, src/render-core.ts:115, src/render-core.ts:117, src/render-core.ts:118, src/render-core.ts:145, src/render-core.ts:146, src/render-core.ts:147, src/render-core.ts:148, src/render-core.ts:149, src/render-core.ts:150, src/render-core.ts:152, src/render-core.ts:153, src/render-core.ts:158, src/render-core.ts:159, src/render-core.ts:234, src/render-core.ts:235, src/render-core.ts:236, src/render-core.ts:237, src/render-core.ts:238, src/render-core.ts:239, src/render-core.ts:240, src/render-core.ts:241, src/render-core.ts:242, src/render-core.ts:243, src/toolbar.ts:110, src/toolbar.ts:113, src/toolbar.ts:294, src/toolbar.ts:295

  > ✅ **Fixed** (Change 34). The rule only flags **static literal** assignments — dynamic
  > values (`= t.transform`, `` = `${px}px` ``) correctly stay inline. Fixed:
  > - **render-core.ts** (110–118, 145–159): the static 3-layer centering/sizing in `RENDER_CSS`
  >   (`.lie-frame` / `.lie-frame > img`); crop height `auto` via the marker class `.lie-crop-fit`.
  >   234–243 (`resetLieState` `= ""`): switched to `removeProperty(...)`.
  > - **crop-editor.ts**: 165/166 deleted (overflow was already in styles.css; z-index added);
  >   172 (`contain:none !important`) → CSS rule `.cm-content > .lie-cropping.lie-cropping`
  >   (doubled class beats app.css' `contain:paint !important`); 251–257 → `.lie-crop-frame-box`;
  >   265–271 → `.lie-crop-img`.
  > - **anchored-submenu.ts** (102–105/116/153): measuring/visibility state → classes
  >   `.lie-measuring` / `.lie-submenu-hidden` (+ `position:fixed` in `.lie-submenu`).
  > - **toolbar.ts** (110/113/294/295): `position`/`z-index` → `.lie-group-popup` /
  >   `.lie-toolbar-floating`.
  > - **export.ts** (258): `width:100%` → `.lie-export-path-input`.

- **Error**: Creating and attaching "style" elements is not allowed. For loading CSS, use a "styles.css" file instead, which Obsidian loads for you.
  - src/runtime.ts:31, src/styles-injector.ts:65

  > **styles-injector.ts:65** → ✅ **Fixed** (Change 33): the `<style>` element is eliminated.
  > `RENDER_CSS` + the default classes (align/inline) now live in `styles.css` (Obsidian loads them),
  > the preset widths are set via `body.style.setProperty`, disabled built-in classes via
  > `body.lie-cls-off-*` markers. `RENDER_CSS` stays the single source; a unit test
  > (`styles-render-css.test.ts`) ensures `styles.css` contains it verbatim (R0).
  >
  > **runtime.ts:31** → ℹ️ **False positive** (Decision 25): this is the separate
  > `lie-runtime.js` bundle for **foreign pages without Obsidian** — there is no Obsidian-loaded
  > `styles.css` there, so `<style>` injection is mandatory. Not part of the plugin; excluded from
  > `lint:obsidian` and documented.

- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:148, styles.css:149, styles.css:150, styles.css:151, styles.css:200, styles.css:201, styles.css:202, styles.css:203, styles.css:268, styles.css:269, styles.css:310, styles.css:311

  > ⚠️ **Kept by deliberate decision** (Decision 26). `:has()` is the **only** CSS way to style a
  > flow-participant **ancestor** (the embed / the `.cm-line`) from a marker on the
  > **descendant** `img` (Bug 10/27; AD5 forbids the reactive-JS alternative). All
  > occurrences are tightly scoped; the target environment is Electron/Chromium (full `:has` support). Only
  > a warning, not an error. Reproduced locally via `npm run lint:css`.

- **Warning**: Do not import Node.js builtin module "net"[src/dev-bridge.ts:2](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/dev-bridge.ts#L2)

  > ℹ️ **False positive** (Decision 25). `dev-bridge.ts` is the **dev-only** CDP relay, behind
  > `if (__LIE_DEV__)` — **removed from the production `main.js` by tree-shaking** (0 hits for `net` in the
  > committed bundle). Never reaches a vault. Excluded from `lint:obsidian`.

- **Warning**: '@codemirror/state' should be listed in the project's dependencies. Run 'npm i -S @codemirror/state' to add it[src/env.d.ts:11](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/env.d.ts#L11)[src/live-preview.ts:2](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/live-preview.ts#L2)[src/main.ts:23](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L23)[src/source-writer.ts:1](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/source-writer.ts#L1)

  > ✅ **Fixed** (Change 35) — but **not** as recommended via `-S` (dependencies). CodeMirror is
  > provided by Obsidian at runtime (esbuild external, nothing bundled). Correctly declared
  > as a **devDependency** (`@codemirror/state` 6.5.0) — satisfies the lint and keeps T1 "no
  > runtime deps". `dependencies` would be factually wrong.

- **Warning**: Promise returned in function argument where a void return was expected.[src/export.ts:225](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/export.ts#L225-L230)[src/main.ts:569](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L569)[src/settings.ts:286](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L286)

  > ✅ **Fixed** (Change 35 + Bug 89). `main.ts:569`: `() => { void this.exportImage(); }`.
  > `settings.ts:286`: `ConfirmModal.onConfirm` widened to `() => void | Promise<void>` + `void` at the
  > call site. `export.ts:225` (**Bug 89**): the async callback was a swallowed error — now
  > synchronous, the write is passed into the outer promise and rejects, so a failed
  > export surfaces as an "Export failed" notice in `exportImage`'s `try/catch` instead of failing silently.

- **Warning**: '@codemirror/view' should be listed in the project's dependencies. Run 'npm i -S @codemirror/view' to add it[src/live-preview.ts:3](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/live-preview.ts#L3)[src/main.ts:24](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L24)[src/source-writer.ts:2](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/source-writer.ts#L2)

  > ✅ **Fixed** (Change 35). As above: `@codemirror/view` (6.38.6) declared as a **devDependency**.

- **Warning**: Passes unsafe values into typed parameters@typescript-eslint/no-unsafe-argument[src/main.ts:67](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L67)

  > ✅ **Fixed** (Change 35). `this.postProcessor.bind(this)` (typed as `any` by TS) replaced
  > with a typed arrow function `(el, ctx) => this.postProcessor(el, ctx)`.

- **Warning**: Unsafe assignment of an `any` value.[src/main.ts:123](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L123)

  > ✅ **Fixed** (Change 35). `loadData()` (returns `any`) typed with `as Partial<LieSettings>`.

- **Warning**: This assertion is unnecessary since it does not change the type of the expression.[src/main.ts:193](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L193)[src/main.ts:210](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L210)[src/main.ts:345](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L345)[src/main.ts:949](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L949-L952)

  > ✅ **Fixed** (Change 35). Removed redundant type assertions (193 `img as HTMLElement` /
  > `img as HTMLImageElement`, 210 `transform as ImageTransform`, 345 `el as HTMLImageElement`,
  > 949 `as HTMLImageElement | undefined` including the surrounding parens). Assertions are erased at
  > compile time; `tsc -noEmit` confirms 0 errors → no behavior change.

- **Warning**: Use '.instanceOf(HTMLElement)' instead of 'instanceof HTMLElement' for cross-window safe type checking.[src/main.ts:486](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L486)

  > ✅ **Fixed** (Change 35). `node instanceof HTMLElement` → `node.instanceOf(HTMLElement)`
  > (Obsidian's cross-window-safe helper).

- **Warning**: This assertion is unnecessary since the receiver accepts the original type of the expression.[src/main.ts:1104](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/main.ts#L1104)

  > ✅ **Fixed** (Change 35). Removed redundant `!` (`cropEditor.open` accepts `null`).

- **Warning**: Use '.instanceOf(HTMLImageElement)' instead of 'instanceof HTMLImageElement' for cross-window safe type checking.[src/runtime.ts:40](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/runtime.ts#L40)[src/runtime.ts:43](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/runtime.ts#L43)

  > ℹ️ **False positive** (Decision 25). `runtime.ts` is the framework-free `lie-runtime.js` bundle;
  > Obsidian's `.instanceOf()` helper does not exist there (it would pull in the framework). Raw
  > `instanceof` against standard DOM is correct. Excluded from `lint:obsidian`.

- **Warning**: Use '.instanceOf(Element)' instead of 'instanceof Element' for cross-window safe type checking.[src/runtime.ts:41](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/runtime.ts#L41)

  > ℹ️ **False positive** (Decision 25) — same as runtime.ts:40 (separate bundle, no Obsidian helper).

- **Warning**: Use '.instanceOf(Document)' instead of 'instanceof Document' for cross-window safe type checking.[src/runtime.ts:41](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/runtime.ts#L41)

  > ℹ️ **False positive** (Decision 25) — same as runtime.ts:40 (separate bundle, no Obsidian helper).

- **Warning**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or `setDestructive().setCta()` for a destructive primary action.[src/settings.ts:53](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L53)[src/settings.ts:281](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L281)

  > ⚠️ **Kept by deliberate decision** (Decision 26). `setDestructive()` is only **@since 1.13.0**, but the plugin
  > targets `minAppVersion` **1.12.7** — a blind switch would break the destructive styling
  > on 1.12.x. Only a deprecation warning (`setWarning` still works). Set to
  > `warn` in the recreation run; switch over when minAppVersion is later raised.

- **Warning**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.[src/settings.ts:238](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L238)[src/settings.ts:267](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L267)[src/settings.ts:305](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L305)[src/settings.ts:365](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/settings.ts#L365)

  > ⚠️ **Kept by deliberate decision** (Decision 26). `getSettingDefinitions` is **1.13.0-only**; Obsidian's
  > own docs explicitly bless `display()` as the fallback for `<1.13.0` (our minAppVersion 1.12.7).
  > Moreover, the declarative API would be a large rework for our imperative, async-scanning settings UI.
  > Kept by deliberate decision, `no-deprecated` → `warn`.

- **Warning**: Use 'window.setTimeout()' instead of 'setTimeout()' for popout window compatibility.[src/toolbar.ts:133](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/src/toolbar.ts#L133)

  > ✅ **Fixed** (Change 35). `setTimeout(` → `window.setTimeout(` (the only bare call;
  > the rest of the code already used it).

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.[styles.css:270](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L270)[styles.css:271](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L271)[styles.css:303](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L303)[styles.css:311](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L311)[styles.css:339](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L339)[styles.css:378](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L378)[styles.css:406](https://github.com/britz/obsidian-live-image-editor/blob/05cae2880e691dd0cc8b0ac9f5856eefa5423b65/styles.css#L406)

  > ⚠️ **Kept by deliberate decision** (Decision 26). Each `!important` overrides an Obsidian-core rule or
  > a dynamically-gated rule with equal/higher specificity: the crop `contain:none` beats
  > app.css' `contain:paint !important`; the tall-float cap overrides the injected float; the
  > dismissed/native-reveal rules override the higher-specificity reveal rules. Only warnings;
  > removing them would regress documented bug fixes (Bug 27/32 and others). Reproduced via `npm run lint:css`.
  > (Line numbers shifted due to the reworks — the rationale still holds.)

- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:148, styles.css:149, styles.css:150, styles.css:151, styles.css:200, styles.css:201, styles.css:202, styles.css:203, styles.css:268, styles.css:269, styles.css:310, styles.css:311

  > ⚠️ **Kept by deliberate decision** (Decision 26) — identical to the `:has` rationale in the *Source code* section:
  > the only CSS way for "ancestor reacts to a marker on the descendant img". Note: moving
  > the default classes out of `styles-injector` into `styles.css` now produces **more**
  > `:has` hits in the CSS scan (the same, justified form) — see `npm run lint:css`.
