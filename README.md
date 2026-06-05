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
or self-update; an MIT [`LICENSE`](LICENSE) is present; no trademark clash. The open items are
review-checklist conformance and are tracked in the development
[issues registry](docs/development/issues.md) (each open rule below links to its entry).

**Status:** ✅ fulfilled · 🚧 open (follow the link)

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
| R20 | Disclose out-of-vault file writes in this README | DP | [🚧](docs/development/issues.md#housekeeping-chore) |
| R21 | Reconcile `isDesktopOnly: false` with the Electron/Node usage | SR | [🚧](docs/development/issues.md#open-decisions) |
| R22 | Remove the plugin-name top-level heading in settings | PG | [🚧](docs/development/issues.md#known-open-bugs) |
| R23 | Use `setHeading()` instead of raw HTML headings | PG | [🚧](docs/development/issues.md#known-open-bugs) |
| R24 | Sentence-case the command names (and route via i18n) | PG | [🚧](docs/development/issues.md#known-open-bugs) |
| R25 | Sentence-case the remaining UI headings | PG | [🚧](docs/development/issues.md#known-open-bugs) |
| R26 | Run user / constructed paths through `normalizePath()` | PG | [🚧](docs/development/issues.md#known-open-bugs) |
| R27 | Polish the manifest description (no em-dash; action verb) | SR | [🚧](docs/development/issues.md#housekeeping-chore) |
| R28 | Move static inline styles to CSS classes | PG | [🚧](docs/development/issues.md#housekeeping-chore) |
| R29 | Prefer the Vault API over the Adapter API where a `TFile` exists | PG | [🚧](docs/development/issues.md#housekeeping-chore) |
| R30 | Verify listener teardown (or switch to `registerDomEvent`) | PG | [🚧](docs/development/issues.md#verifications-need-eyes-on-a-real--focused-window) |

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

### Open rules (in progress)

Each links to its entry in the development [issues registry](docs/development/issues.md), grouped by task type.

- **R20 — Disclose out-of-vault file writes in this README** (DP). The export save dialog can write the rendered image to any path the user chooses, including outside the vault; the policy requires this README to say so. → [Housekeeping](docs/development/issues.md#housekeeping-chore)
- **R21 — Reconcile `isDesktopOnly: false` with the Electron/Node usage** (SR). Export and the rotate gesture use feature-detected Electron/Node APIs with mobile fallbacks; decide whether to keep `false` (and document the degradation) or set `true`. → [Open decisions](docs/development/issues.md#open-decisions)
- **R22 — Remove the plugin-name top-level heading in settings** (PG; *Bug 60*). → [Known open bugs](docs/development/issues.md#known-open-bugs)
- **R23 — Use `setHeading()` instead of raw HTML headings** (PG; *Bug 61*). → [Known open bugs](docs/development/issues.md#known-open-bugs)
- **R24 — Sentence-case the command names and route them through i18n** (PG; *Bug 62*). → [Known open bugs](docs/development/issues.md#known-open-bugs)
- **R25 — Sentence-case the remaining UI headings** (PG; *Bug 63*). → [Known open bugs](docs/development/issues.md#known-open-bugs)
- **R26 — Run user-defined / constructed paths through `normalizePath()`** (PG; *Bug 64*). → [Known open bugs](docs/development/issues.md#known-open-bugs)
- **R27 — Polish the manifest description** (SR) — drop the em-dash, lead with an action verb. → [Housekeeping](docs/development/issues.md#housekeeping-chore)
- **R28 — Move static inline styles to CSS classes** (PG) — the "no hardcoded styling" guideline; keep runtime-computed geometry as-is. → [Housekeeping](docs/development/issues.md#housekeeping-chore)
- **R29 — Prefer the Vault API over the Adapter API where a vault `TFile` exists** (PG). → [Housekeeping](docs/development/issues.md#housekeeping-chore)
- **R30 — Verify teardown of direct `document`/`window` listeners, or switch to `registerDomEvent`** (PG). → [Verifications](docs/development/issues.md#verifications-need-eyes-on-a-real--focused-window)

### Submission checklist (manual, at release time)

Not code — the packaging steps performed when cutting a community-directory release:

- [ ] GitHub release with `main.js` + `manifest.json` (+ `styles.css`) attached **as binaries**.
- [ ] Release **tag == manifest `version`**, with **no `v` prefix** (tag `0.4.0`, not `v0.4.0`).
- [ ] Manifest at **HEAD of the default branch** is the submitted one (`main`).
- [ ] PR to `obsidianmd/obsidian-releases` editing `community-plugins.json`, **one plugin per PR**.
- [ ] GitHub account linked to the Obsidian profile; agree to the Developer policies in the form.

## License

[MIT](LICENSE)
