# Live Image Editor

Non-destructive image editing for Obsidian. Crop, rotate, flip, resize, and apply CSS filters — all live, without modifying the original file.

## Features

- **Toolbar on selection** — appears when you click an image, same trigger as Obsidian's native resize handles
- **Crop with free rotation** — fixed frame, freely move/rotate/scale the image underneath
- **CSS Filters** — brightness, contrast, saturation, hue, blur, grayscale, sepia with a side panel and live histogram
- **Filter Presets** — one-click looks (B&W, Vintage, Warm, Cool, Sepia, ...)
- **Resize** — scale up/down, custom dimensions, or predefined size classes
- **Flip & Rotate** — horizontal/vertical flip, 90° steps or free rotation via crop
- **Inline/Block toggle** — switch between text-wrapping and standalone display
- **CSS class management** — auto-detects classes from your vault's CSS snippets
- **Export** — render all edits to a new image file (original stays untouched)
- **Editing Toolbar integration** — optionally registers commands as buttons in [Editing Toolbar](https://github.com/pkm-er/obsidian-editing-toolbar)
- **Multilingual** — follows Obsidian's language setting

## How it works

Edits are stored as a small, portable attribute block **after** the image embed — standard
Markdown/wiki syntax, never the alt text or the file. The original image is never touched.

```markdown
![A caption](photo.png){rotate=90 width=420}
![[photo.png]]{align=left filter="sepia(0.8)"}
![square](photo.png){transform="translate(-50%,-50%) scale(2)" aspect-ratio=1/1 width=260 .rounded}
```

The block uses bare keys (`align`, `width`, `rotate`, `flip`, `transform`, `filter`,
`aspect-ratio`, `.class`) — the same portable format MkDocs-Material / Python-Markdown / Pandoc
understand. Open the note **without** the plugin and the image still shows: `align`/`width` carry
through any renderer, and the rest fall back to the original, untransformed image. Obsidian's native
wiki-link size (`![[image.png|300]]`) continues to work and is preserved.

## Example vault

[`example-vault/`](example-vault/) is a self-contained Obsidian vault that demonstrates **every**
feature on synthetic, committable images (corner labels **A/B/C/D** + a **TOP** marker make
rotate/flip obvious). To try it:

1. In Obsidian, **Open folder as vault** → pick the `example-vault/` directory.
2. Enable **Live Image Editor** in *Settings → Community plugins* (install it first if needed —
   see [Installation](#installation)).
3. Open **`00 — Start here`** and work through the numbered pages (Rotate & flip, Crop, Size,
   Filters, Layout, Captions, Classes). Hover an image to reveal the toolbar and edit away.

Two features ship opt-in — turn them on from *Settings → Live Image Editor*: **Show image captions**
and **Install example snippets** (the latter is already installed and enabled in this vault).

## Documentation

📖 **[Documentation site](https://britz.github.io/obsidian-live-image-editor/)** — the user guide,
the demo vault (with images rendered *live* by the plugin's runtime) and the design docs, published
from `docs/` via ProperDocs + MaterialX (the maintained MkDocs / Material forks).

- **[User guide](docs/user-guide.md)** — how to use every feature, with screenshots.
- **[`example-vault/`](example-vault/)** — a demo vault that shows each feature on real images
  (open it as a vault with the plugin enabled; start at *00 — Start here*).
- **[Development docs](docs/development/README.md)** — the design docs (requirements, architecture,
  plan, tests, the bug & lesson registry) **and the developer workflow**: building from source, the
  dev/debug loop, and previewing this docs site locally.

## Installation

1. Download the latest release from [Releases](https://github.com/Britz/obsidian-live-image-editor/releases)
2. Extract into your vault's `.obsidian/plugins/live-image-editor/` directory
3. Enable the plugin in Settings > Community Plugins

## Development

Building the plugin from source, the watch / dev-install loop, live debugging in Obsidian (CDP), and
previewing the docs site locally are all covered in the
**[Development docs](docs/development/README.md)** — everything builds inside the devcontainer.

## Release compliance

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
or self-update; an MIT [`LICENSE`](LICENSE) is present; no trademark clash. **All review-checklist
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

### Fulfilled rules in detail

- **R1 — No ads** (DP). The UI shows no advertisements, sponsored content, or dynamically loaded promotions.
- **R2 — No telemetry, no network** (DP). The production bundle makes no network requests — `fetch`, `requestUrl`, and `XMLHttpRequest` appear zero times — and collects or sends nothing about usage.
- **R3 — No self-update** (DP). Nothing downloads or updates the plugin at runtime; the only socket server (the CDP debug relay) is dev-only, gated behind `__LIE_DEV__`, and tree-shaken out of the shipped `main.js` (verified: 0 hits).
- **R4 — License** (SR). An MIT [`LICENSE`](LICENSE) is present and declared.
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
- **R20 — Out-of-vault file writes disclosed** (DP). See [File system access & platform support](#file-system-access--platform-support) below — the export save dialog can write the rendered image anywhere the user chooses, including outside the vault.
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

### File system access & platform support

**File system access.** Almost everything the plugin does stays inside your vault and is fully
non-destructive — the original image file is never modified. The **one** exception is the **Export
as image** action: on desktop it opens your operating system's native *Save* dialog, so you can
write the rendered (transformed/filtered) copy to **any location you choose, including outside the
vault**. Nothing is written outside the vault without you picking that location in the dialog. On
mobile (no native dialog) export falls back to an in-app prompt that writes a copy **inside** the
vault.

**Platform support (`isDesktopOnly: false`).** The plugin runs on both desktop and mobile. Two
features use Electron/Node APIs that only exist on desktop, and both degrade gracefully on mobile:
the **export save dialog** (mobile writes into the vault instead) and the **macOS two-finger
trackpad rotate gesture** in the crop editor (the on-screen rotate handle is always available as the
fallback). The access is dynamic and feature-detected, so core editing — rotate, flip, crop, resize,
filters, classes — works on mobile too.

### Submission checklist (manual, at release time)

Not code — the packaging steps performed when cutting a community-directory release:

- [ ] GitHub release with `main.js` + `manifest.json` (+ `styles.css`) attached **as binaries**.
- [ ] Release **tag == manifest `version`**, with **no `v` prefix** (tag `0.4.0`, not `v0.4.0`).
- [ ] Manifest at **HEAD of the default branch** is the submitted one (`main`).
- [ ] PR to `obsidianmd/obsidian-releases` editing `community-plugins.json`, **one plugin per PR**.
- [ ] GitHub account linked to the Obsidian profile; agree to the Developer policies in the form.

## License

[MIT](LICENSE)
