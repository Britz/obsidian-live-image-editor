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

The plugin is **accepted into Obsidian's community plugin directory**:
**<https://community.obsidian.md/plugins/live-image-editor>**.

Last audited **2026-06-05**. There is **no hard-policy violation** — no ads, telemetry, obfuscation,
or self-update; an MIT [`LICENSE`](../../LICENSE) is present; no trademark clash. **All review-checklist
rules (R1–R30) are now met** — the former open items (R20–R30) were closed in the v0.4.2
release-compliance pass. The only remaining steps are the manual packaging actions in the
[Submission checklist](#submission-checklist-manual-at-release-time) below.

**Status:** :lucide-circle-check:{ .lie-ok } fulfilled — listed in the community directory

| Rule | Requirement | Source | Status |
| --- | --- | --- | --- |
| R1 | No ads (dynamic or static) | DP | :lucide-circle-check:{ .lie-ok } |
| R2 | No client-side telemetry; no network calls in the production build | DP | :lucide-circle-check:{ .lie-ok } |
| R3 | No self-update mechanism | DP | :lucide-circle-check:{ .lie-ok } |
| R4 | `LICENSE` present and declared | SR | :lucide-circle-check:{ .lie-ok } |
| R5 | No `innerHTML` / `outerHTML` / `insertAdjacentHTML` | PG | :lucide-circle-check:{ .lie-ok } |
| R6 | No `var` (only `const` / `let`) | PG | :lucide-circle-check:{ .lie-ok } |
| R7 | No global `app` / `window.app` (uses `this.app`) | PG | :lucide-circle-check:{ .lie-ok } |
| R8 | No deprecated `workspace.activeLeaf` | PG | :lucide-circle-check:{ .lie-ok } |
| R9 | `async`/`await` over raw Promise chains | PG | :lucide-circle-check:{ .lie-ok } |
| R10 | `onunload` does not detach leaves | PG | :lucide-circle-check:{ .lie-ok } |
| R11 | No default hotkeys; `checkCallback` used correctly | PG | :lucide-circle-check:{ .lie-ok } |
| R12 | `console.*` only in the dev-only bridge | PG | :lucide-circle-check:{ .lie-ok } |
| R13 | `registerEvent` / `registerMarkdownPostProcessor` for auto-cleanup | PG | :lucide-circle-check:{ .lie-ok } |
| R14 | Manifest `id` / `name` follow the naming rules | SR | :lucide-circle-check:{ .lie-ok } |
| R15 | `fundingUrl` omitted (no donations) | SR | :lucide-circle-check:{ .lie-ok } |
| R16 | Command IDs not prefixed with the plugin id | PG | :lucide-circle-check:{ .lie-ok } |
| R17 | `version` is `x.y.z`; `minAppVersion` set | SR | :lucide-circle-check:{ .lie-ok } |
| R18 | Template sample code removed | PG | :lucide-circle-check:{ .lie-ok } |
| R19 | Toolbar / UI strings sentence case | PG | :lucide-circle-check:{ .lie-ok } |
| R20 | Disclose out-of-vault file writes in this README | DP | :lucide-circle-check:{ .lie-ok } |
| R21 | Reconcile `isDesktopOnly: false` with the Electron/Node usage | SR | :lucide-circle-check:{ .lie-ok } |
| R22 | Remove the plugin-name top-level heading in settings | PG | :lucide-circle-check:{ .lie-ok } |
| R23 | Use `setHeading()` instead of raw HTML headings | PG | :lucide-circle-check:{ .lie-ok } |
| R24 | Sentence-case the command names (and route via i18n) | PG | :lucide-circle-check:{ .lie-ok } |
| R25 | Sentence-case the remaining UI headings | PG | :lucide-circle-check:{ .lie-ok } |
| R26 | Run user / constructed paths through `normalizePath()` | PG | :lucide-circle-check:{ .lie-ok } |
| R27 | Polish the manifest description (no em-dash; action verb) | SR | :lucide-circle-check:{ .lie-ok } |
| R28 | Move static inline styles to CSS classes | PG | :lucide-circle-check:{ .lie-ok } |
| R29 | Prefer the Vault API over the Adapter API where a `TFile` exists | PG | :lucide-circle-check:{ .lie-ok } |
| R30 | Verify listener teardown (or switch to `registerDomEvent`) | PG | :lucide-circle-check:{ .lie-ok } |
| W1 | [`:has()` in CSS](#w-has) — architecturally required | Review | :lucide-triangle-alert:{ .lie-warn } |
| W2 | [`!important` in CSS](#w-important) — overrides core / gated rules | Review | :lucide-triangle-alert:{ .lie-warn } |
| W3 | [`setWarning()` / `display()` deprecations](#w-deprecations) — 1.12.7 floor | Review | :lucide-triangle-alert:{ .lie-warn } |
| W4 | [`document` → `activeDocument` in the runtime](#w-active-doc) — off-Obsidian, false positive | Review | :lucide-info:{ .lie-info } |
| W5 | [Vault enumeration (`vault.getFiles` / `getMarkdownFiles`)](#w-vault-enum) — F26 picker | Review | :lucide-triangle-alert:{ .lie-warn } |
| W6 | [`net` import in the dev-only bridge](#w-net) — tree-shaken, false positive | Review | :lucide-info:{ .lie-info } |
| W7 | [raw `instanceof` in the runtime bundle](#w-instanceof) — off-Obsidian, false positive | Review | :lucide-info:{ .lie-info } |
| W8 | [`lie-runtime.js` extra release asset](#w-runtime-asset) — intentional standalone runtime, ignored by Obsidian | Review | :lucide-info:{ .lie-info } |

Rows **W1–W8** are the warnings/remarks the automated review still surfaces (and that may show on the
directory page). None fails the review; each links to its one-sentence justification in
[Automated plugin-review pass](#automated-plugin-review-pass-v06x) below, with the full detail in the
[review reports](reviews/). :lucide-triangle-alert:{ .lie-warn } = kept by deliberate decision ·
:lucide-info:{ .lie-info } = false positive (not in the shipped plugin).

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
errors** (only the documented warnings below remain).

The official review now **passes** (0 errors). Everything it still surfaces is a non-failing
**warning** (:lucide-triangle-alert:{ .lie-warn } — kept by deliberate decision) or a **false
positive** (:lucide-info:{ .lie-info } — never reaches the shipped plugin). Each is justified below;
full per-item, line-referenced detail is in the review reports — latest
[`review-0.6.10.md`](reviews/review-0.6.10.md) (commit `5aae54e`); earlier
[`review-0.6.9.md`](reviews/review-0.6.9.md), [`review-0.6.8.md`](reviews/review-0.6.8.md),
[`review-0.6.5.md`](reviews/review-0.6.5.md), [`review-0.6.2.md`](reviews/review-0.6.2.md); the
original failing pass in [`review-0.6.0.md`](reviews/review-0.6.0.md) /
[`review-0.6.1.md`](reviews/review-0.6.1.md)).

- :lucide-triangle-alert:{ .lie-warn } **`:has()`**{ #w-has } (CSS scan) — only used where unavoidable (the runtime itself is `:has`-free; target is Electron/Chromium, full support):
  - the reveal slaving `.cm-line:has(> .cm-formatting)` reacts to Obsidian's own editor DOM;
  - the alignment-float host rules `.host:has(.lie-image-area.lie-…)` style a flow-participant host the plugin does not own, reacting to the box's marker.
- :lucide-triangle-alert:{ .lie-warn } **`!important`**{ #w-important } (CSS scan) — each beats an Obsidian-core or higher-specificity rule (removing them would rely on fragile cascade order):
  - `.lie-frame > img { max-width:none }` beats the theme's `img { max-width }`;
  - the crop-frame + handle suppression (`.lie-cropping`), the dismissed/native reveal and the tall-float cap each beat their higher-specificity counterparts.
- :lucide-triangle-alert:{ .lie-warn } **`setWarning()` / `display()` deprecations**{ #w-deprecations } (`@typescript-eslint/no-deprecated`) — their replacements (`setDestructive` / `getSettingDefinitions`) are `@since 1.13.0`, but `minAppVersion` is **1.12.7**, where `display()` is the sanctioned fallback. Kept until the floor is raised.
- :lucide-info:{ .lie-info } **`document` → `activeDocument`**{ #w-active-doc } (`obsidianmd/prefer-active-doc`) — the in-Obsidian plugin source was converted in **Change 40** (0.6.9); every remaining hit is in **`runtime.ts`**, the framework-free off-Obsidian bundle (compiled to `lie-runtime.js`, never part of the shipped `main.js`), where Obsidian's `activeDocument` global does not exist — the same exception class as its raw `instanceof`. (The runtime itself SHIMS `activeDocument`/`activeWindow` for the shared core it bundles — Bug 119, [0.6.13] — which adds a couple of bare `document`/`window` hits on the shim line, the same off-Obsidian false-positive class. The separate in-plugin `window` → `activeWindow` conversion stays open under **Feature 39**, not currently surfaced by the review.)
- :lucide-triangle-alert:{ .lie-warn } **Vault enumeration**{ #w-vault-enum } (`vault.getFiles` / `getMarkdownFiles`) — the F26 Replace-image picker needs the full image-candidate set up front; already filtered to image extensions; no narrower public API.
- :lucide-info:{ .lie-info } **`net` import**{ #w-net } (`dev-bridge.ts`) — the dev-only CDP relay is gated behind `__LIE_DEV__` and tree-shaken out of production (0 hits). Never ships.
- :lucide-info:{ .lie-info } **Raw `instanceof`**{ #w-instanceof } (`runtime.ts`) — the framework-free off-Obsidian bundle imports no `obsidian`, so the `.instanceOf()` helper does not exist there; raw `instanceof` against standard DOM is correct.
- :lucide-info:{ .lie-info } **`lie-runtime.js` extra release asset**{ #w-runtime-asset } (Releases scan) — the GitHub release also attaches the **standalone runtime** (`lie-runtime.js`) for off-Obsidian use; Obsidian's installer downloads only `main.js` / `manifest.json` / `styles.css`, so it ignores this asset. Deliberate — the runtime ships via the release, not the plugin.

## Submission checklist (manual, at release time)

Not code — the packaging steps performed when cutting a community-directory release:

- [ ] GitHub release with `main.js` + `manifest.json` (+ `styles.css`) attached **as binaries**.
- [ ] Release **tag == manifest `version`**, with **no `v` prefix** (tag `0.4.0`, not `v0.4.0`).
- [ ] Manifest at **HEAD of the default branch** is the submitted one (`main`).
- [ ] PR to `obsidianmd/obsidian-releases` editing `community-plugins.json`, **one plugin per PR**.
- [ ] GitHub account linked to the Obsidian profile; agree to the Developer policies in the form.
