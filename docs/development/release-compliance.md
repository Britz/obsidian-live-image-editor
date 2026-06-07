# Release compliance

The **community-directory submission gate**. It sits **parallel to the [test plan](test-plan.md)**
— the test plan verifies *behaviour*, this verifies *shippability* — and holds the **release
requirements** (the former standalone `RC1–RC11`, now the `R1–R30` audit).

Before each community-directory submission the plugin is audited against Obsidian's **three official
rule sources** — every rule below is drawn from one of them:

- **[Developer policies](https://docs.obsidian.md/Developer+policies)** (**DP**) — the hard
  directory rules every plugin must obey: no ads, no telemetry, no obfuscation, no self-updating
  code, disclose any out-of-vault file access, and so on.
- **[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)** (**PG**) —
  the review checklist of recommended practices: use `setHeading()`, sentence-case UI strings,
  `normalizePath()` user paths, no hardcoded styling, release resources on unload, and so on.
- **[Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)** +
  **[Submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)**
  (**SR**) — the manifest/packaging checks the submission bot and human reviewers run: `id`/`name`
  naming, `version`/`minAppVersion`, `isDesktopOnly`, the release artifacts, and so on.

Last audited **2026-06-05**. There is **no hard-policy violation** — no ads, telemetry, obfuscation,
or self-update; an MIT [`LICENSE`](../../LICENSE) is present; no trademark clash. **All review-checklist
rules (R1–R30) are now met** — the former open items (R20–R30) were closed in the v0.4.2
release-compliance pass. The only remaining steps are the manual packaging actions in the
[Submission checklist](#submission-checklist-manual-at-release-time) below.

**Status:** ✅ fulfilled

| Rule | Requirement | Source | Status |
| --- | --- | --- | --- |
| R1 | No ads (dynamic or static) | DP | ✅ |
| R2 | No client-side telemetry; no network calls in the production build | DP | ✅ |
| R3 | No self-update mechanism | DP | ✅ |
| R4 | `LICENSE` present and declared | SR | ✅ |
| R5 | No `innerHTML` / `outerHTML` / `insertAdjacentHTML` | PG | ✅ |
| R6 | No `var` (only `const` / `let`) | PG | ✅ |
| R7 | No global `app` / `window.app` (uses `this.app`) | PG | ✅ |
| R8 | No deprecated `workspace.activeLeaf` | PG | ✅ |
| R9 | `async`/`await` over raw Promise chains | PG | ✅ |
| R10 | `onunload` does not detach leaves | PG | ✅ |
| R11 | No default hotkeys; `checkCallback` used correctly | PG | ✅ |
| R12 | `console.*` only in the dev-only bridge | PG | ✅ |
| R13 | `registerEvent` / `registerMarkdownPostProcessor` for auto-cleanup | PG | ✅ |
| R14 | Manifest `id` / `name` follow the naming rules | SR | ✅ |
| R15 | `fundingUrl` omitted (no donations) | SR | ✅ |
| R16 | Command IDs not prefixed with the plugin id | PG | ✅ |
| R17 | `version` is `x.y.z`; `minAppVersion` set | SR | ✅ |
| R18 | Template sample code removed | PG | ✅ |
| R19 | Toolbar / UI strings sentence case | PG | ✅ |
| R20 | Disclose out-of-vault file writes in this README | DP | ✅ |
| R21 | Reconcile `isDesktopOnly: false` with the Electron/Node usage | SR | ✅ |
| R22 | Remove the plugin-name top-level heading in settings | PG | ✅ |
| R23 | Use `setHeading()` instead of raw HTML headings | PG | ✅ |
| R24 | Sentence-case the command names (and route via i18n) | PG | ✅ |
| R25 | Sentence-case the remaining UI headings | PG | ✅ |
| R26 | Run user / constructed paths through `normalizePath()` | PG | ✅ |
| R27 | Polish the manifest description (no em-dash; action verb) | SR | ✅ |
| R28 | Move static inline styles to CSS classes | PG | ✅ |
| R29 | Prefer the Vault API over the Adapter API where a `TFile` exists | PG | ✅ |
| R30 | Verify listener teardown (or switch to `registerDomEvent`) | PG | ✅ |

## Fulfilled rules in detail

- **R1 — No ads** (DP). The UI shows no advertisements, sponsored content, or dynamically loaded promotions.
- **R2 — No telemetry, no network** (DP). The production bundle makes no network requests — `fetch`, `requestUrl`, and `XMLHttpRequest` appear zero times — and collects or sends nothing about usage.
- **R3 — No self-update** (DP). Nothing downloads or updates the plugin at runtime; the only socket server (the CDP debug relay) is dev-only, gated behind `__LIE_DEV__`, and tree-shaken out of the shipped `main.js` (verified: 0 hits).
- **R4 — License** (SR). An MIT [`LICENSE`](../../LICENSE) is present and declared.
- **R5 — No raw HTML injection** (PG). The DOM is built with Obsidian's `createEl`/`createDiv` helpers; no `innerHTML`/`outerHTML`/`insertAdjacentHTML`.
- **R6 — No `var`** (PG). Only `const`/`let`.
- **R7 — No global `app`** (PG). The plugin always uses `this.app`, never the deprecated global `app`/`window.app`.
- **R8 — No `activeLeaf`** (PG). Avoids the deprecated `workspace.activeLeaf`.
- **R9 — async/await** (PG). Asynchronous flows use `async`/`await`, not raw Promise chains.
- **R10 — Clean `onunload`** (PG). `onunload` does not detach the plugin's leaves (Obsidian manages that).
- **R11 — No default hotkeys** (PG). Commands register no default hotkeys and use `checkCallback`, so they only appear when an image is actionable.
- **R12 — Logging only in dev** (PG). `console.*` calls live solely in the dev-only bridge, never in production paths.
- **R13 — Auto-cleanup** (PG). Events and the markdown post-processor register through `registerEvent`/`registerMarkdownPostProcessor`, so Obsidian releases them on unload.
- **R14 — Manifest naming** (SR). `id` is `live-image-editor` (lowercase-dashes, no "obsidian"/"plugin"); `name` is `Live Image Editor` (no "Obsidian"/"Plugin").
- **R15 — No funding solicitation** (SR). `fundingUrl` is omitted; the plugin asks for no donations.
- **R16 — Command IDs** (PG). Command IDs are not prefixed with the plugin id (Obsidian adds the prefix itself).
- **R17 — Versioning** (SR). `version` is semver `x.y.z` and `minAppVersion` is set in the manifest.
- **R18 — No sample code** (PG). The template scaffolding (`MyPlugin`/`SampleSettingTab`/`SampleModal`) is removed.
- **R19 — Sentence case** (PG). Toolbar and panel strings are already sentence case.
- **R20 — Out-of-vault file writes disclosed** (DP). See [File system access & platform support](../../README.md#file-system-access--platform-support) below — the export save dialog can write the rendered image anywhere the user chooses, including outside the vault.
- **R21 — `isDesktopOnly: false` reconciled** (SR). The Electron/Node access (export save dialog, macOS rotate gesture) is dynamic + feature-detected with mobile fallbacks, so the plugin genuinely runs on mobile; `false` is kept and the degradation is documented (code comment in `export.ts` + the platform note below).
- **R22 — No plugin-name heading** (PG; *Bug 68*). The top-level `<h2>` plugin-name heading in the settings tab was removed.
- **R23 — `setHeading()`** (PG; *Bug 69*). Section headings use `new Setting(...).setHeading()` instead of raw `<h3>` elements.
- **R24 — Sentence-case commands** (PG; *Bug 70*). The size/align command names are sentence case (`Size: small`, `Align: left`, …) and routed through i18n.
- **R25 — Sentence-case headings** (PG; *Bug 71*). The remaining UI headings (`CSS snippets`, `Editing toolbar integration`) are sentence case.
- **R26 — `normalizePath()`** (PG; *Bug 72*). User-entered (export fallback) and constructed (snippet) paths pass through `normalizePath()`.
- **R27 — Manifest description** (SR). Leads with an action verb and contains no em-dash or special characters.
- **R28 — No hardcoded styling** (PG). The one static inline style (the version-warning colour) moved to a `.lie-settings-warning` CSS class; only runtime-computed geometry remains inline.
- **R29 — Vault API** (PG). `suggestExportPath` uses `Vault.getAbstractFileByPath()` rather than the adapter; the unavoidable `configDir/snippets` adapter calls (config-dir files are not vault `TFile`s) are left as-is.
- **R30 — Listener teardown** (PG). Every direct `document`/`window` listener is interaction-scoped with matching teardown (popup close, crop exit, drag end, submenu/toolbar detach, `{ once: true }`); plugin-lifetime listeners already use `registerDomEvent`. `registerDomEvent` is intentionally **not** used for the per-interaction listeners (it holds until unload, so it cannot detach a per-drag `pointermove`).

## Automated plugin-review pass (v0.6.x)

Obsidian's automated submission review — the `eslint-plugin-obsidianmd` recommended ruleset, a CSS
scan for `:has` / `!important`, and a behaviour scan — is reproduced locally as **separate, dev-only**
passes: `npm run lint:obsidian` (a dedicated `eslint.obsidian.config.mjs`) and `npm run lint:css`
(stylelint). The **shipped** linter (`npm run lint` / `eslint.config.mjs`) is kept exactly as-is
(requirement T9), so reproducing the review never touches the gate. `lint:obsidian` reports **0
errors** (only the documented deprecation warnings below remain). Each v0.6.0 review finding and how
it was handled:

**Errors — resolved (these are what failed the review):**

- **Sets styles directly** (`obsidianmd/no-static-styles-assignment`). Static literal styles moved to
  CSS classes / `RENDER_CSS`; per-image *dynamic* values stay inline (the rule flags only literals).
  (Change 34.)
- **Creating `<style>` elements** (`obsidianmd/no-forbidden-elements`). The plugin no longer injects a
  `<style>`: `RENDER_CSS` + the built-in classes live in `styles.css`, preset widths are set as `body`
  CSS variables, and disabled built-ins are body-class markers. (Change 33.) The same flag on
  `runtime.ts` is a **false positive** — see below.

**Kept with justification (warnings / recommendations — they do not fail the review):**

- **`:has()`** (CSS scan). Minimised: the inline and embed-shrink-wrap `:has` were replaced by direct
  classes, and the standalone runtime is now `:has`-free. The remaining `:has` are unavoidable — the
  reveal slaving (`.cm-line:has(> .cm-formatting)`) reacts to Obsidian's OWN editor DOM, and the
  alignment-float host rules (`.host:has(.lie-image-area.lie-…)`) must style a flow-participant host
  the plugin does not own, reacting to the box's marker. Target is Electron/Chromium, where `:has` is
  fully supported. (Decision 26 / 28.)
- **`!important`** (CSS scan). Audited and minimised — the one defensive `!important` with no
  competing rule (the float-out toolbar-hide; `display` is set by no other rule on that element) was
  dropped. Each remaining one overrides an Obsidian-core or higher-specificity rule — the crop
  `contain:none` beating app.css `contain:paint !important`, `.lie-frame > img { max-width:none }`
  beating Obsidian/theme `img { max-width }`, the crop selection-frame suppression beating the
  higher-specificity `:hover` frame, the dismissed/native reveal beating the reveal rules, the
  tall-float cap — so removing it would rely on fragile cascade order and regress documented fixes.
  (Decision 26.)
- **`setWarning()` / `PluginSettingTab.display()` deprecations** (`@typescript-eslint/no-deprecated`).
  Their replacements (`setDestructive` / `getSettingDefinitions`) are `@since 1.13.0`, but
  `minAppVersion` is **1.12.7** and `display()` is the officially-sanctioned pre-1.13.0 fallback. Kept
  until the floor is raised; reported as warnings, not errors. (Decision 26.)
- **`net` Node-builtin import** (`dev-bridge.ts`). False positive: the dev-only CDP relay is gated
  behind `__LIE_DEV__` and tree-shaken out of the production `main.js` (verified 0 hits). Excluded
  from the `lint:obsidian` scope. (Decision 25.)
- **`<style>` element + raw `instanceof`** (`runtime.ts`). False positives: the standalone,
  framework-free `lie-runtime.js` bundle (for foreign, non-Obsidian pages) has no Obsidian-loaded
  `styles.css` and no Obsidian helpers, so both are required and correct there. It is not the shipped
  plugin. Excluded from scope. (Decision 25.)
- **`@codemirror/state` / `@codemirror/view` "should be in dependencies".** Declared as
  **devDependencies**, NOT runtime `dependencies`: they are Obsidian-provided esbuild externals, never
  bundled (T1 — no runtime deps). The lint's literal "dependencies" prescription is wrong for a
  host-provided external. (Change 35.)
- **Vault Enumeration** (`vault.getFiles`). Required by the F26 Replace-image picker — a
  `FuzzySuggestModal` needs the full image candidate set up front; it is already filtered to image
  extensions and there is no narrower public API.
- **Local Storage.** Was a READ of Obsidian's own `language` key (F21 — follow Obsidian's locale),
  not plugin persistence; switched to Obsidian's `getLanguage()`. Plugin settings use
  `loadData` / `saveData`. (Change 35.)
- **Missing GitHub artifact attestations.** Adopted — the release workflow runs
  `actions/attest-build-provenance` on `main.js` / `styles.css` (verify with `gh attestation verify`).
  Attestation only happens in GitHub Actions, so the local `gh release` path stays unattested.
  (Decision 27.)

The behaviour-neutral lint cleanups — `instanceof` → `.instanceOf()`, bare `setTimeout` →
`window.setTimeout`, promise-returned-where-void-expected, redundant type assertions, sentence-case
notices — were applied (Change 35). Full per-item annotations are in `releast-state.md`.

## Submission checklist (manual, at release time)

Not code — the packaging steps performed when cutting a community-directory release:

- [ ] GitHub release with `main.js` + `manifest.json` (+ `styles.css`) attached **as binaries**.
- [ ] Release **tag == manifest `version`**, with **no `v` prefix** (tag `0.4.0`, not `v0.4.0`).
- [ ] Manifest at **HEAD of the default branch** is the submitted one (`main`).
- [ ] PR to `obsidianmd/obsidian-releases` editing `community-plugins.json`, **one plugin per PR**.
- [ ] GitHub account linked to the Obsidian profile; agree to the Developer policies in the form.
