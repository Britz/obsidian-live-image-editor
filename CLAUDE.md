# CLAUDE.md

## Project

Obsidian plugin: **Live Image Editor** (`obsidian-live-image-editor`).
Non-destructive image editing via CSS transforms and filters — the original image file is **never** modified. A hover toolbar with native Lucide icons lets the user rotate, flip, crop (with free rotation), resize, filter and export images, plus apply predefined or vault-snippet CSS classes. The plugin follows Obsidian's locale and its central "Use [[Wikilinks]]" setting; it adds no language or link-format setting of its own.

> **Single source of truth:** this file. PLAN.md is being phased out — everything in it has been folded in here. If the two disagree, this file wins.

## Build & Test

All commands run inside the devcontainer (podman). Never install or build on the host.

```bash
npm run build      # tsc -noEmit + esbuild production
npm run lint       # eslint src/
npm test           # vitest run
npm run dev        # esbuild watch mode
npm run dev:vault  # esbuild watch -> writes straight into the examples/ vault plugin dir (Developer Toolbox auto-reloads)
npm run check:watch  # tsc -noEmit --watch (live type errors in the terminal; esbuild does not type-check)
```

Install into a vault for testing:
```bash
./scripts/dev-install.sh ~/path/to/vault          # production build
./scripts/dev-install.sh ~/path/to/vault --dev    # debug build (inline source maps, not minified)
```

Build gotcha — `esbuild: Failed to write to output file: open /workspace/main.js: permission denied`: a pre-existing `main.js` couldn't be overwritten (verified fix: `rm -f main.js && npm run build`; likely cause — the file was owned by another uid, e.g. created on the host or by root, so the container user couldn't write it; not independently confirmed).

## Live debugging in Obsidian (CDP)

Obsidian (Electron) exposes the Chrome DevTools Protocol; from inside the devcontainer any session can tail console/exceptions and evaluate code in the running plugin. CDP binds to 127.0.0.1 on the host, so it needs re-exposing — the **dev build does this itself** via an in-plugin relay (`src/dev-bridge.ts`, tree-shaken out of production). No host-side relay process.

Setup — on the HOST, launch Obsidian with the debug port (CDP on 9223; the plugin relay re-exposes it on 0.0.0.0:9222). Use the launcher (double-clickable in Finder), or the raw command — there is no in-app UI toggle (it's an Electron launch flag):
```bash
scripts/obsidian-dev.command   # quits any running Obsidian, relaunches with the flags (macOS)
# equivalent: /Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9223 --remote-allow-origins=*
```
Then enable a **dev build** of the plugin in the vault (`npm run dev:vault`, or `./scripts/dev-install.sh <vault> --dev`). On load it logs `[lie-dev-bridge] CDP relay ...`.

From the devcontainer (reaches the host via host.containers.internal; connects by IP so Chromium's Host-header anti-rebinding check passes):
```bash
node scripts/obsidian-debug.mjs --list             # list debuggable targets
node scripts/obsidian-debug.mjs                     # tail console + exceptions
node scripts/obsidian-debug.mjs --eval 'app.plugins.plugins["obsidian-live-image-editor"]?.manifest.version'
```
Override the endpoint with `CDP_HOST` / `CDP_PORT` (default `host.containers.internal:9222`). Fallback if not using a dev build: run `scripts/cdp-relay.mjs` (or socat) on the host instead.

CDP gotchas:
- `location.reload()` via `--eval` does a clean full reload (the relay restarts with the plugin) — better than `disablePlugin`/`enablePlugin`, which can accumulate stale registrations.
- `--eval` returns an arrow function as `{}` if you forget to invoke it; wrap returns in `JSON.stringify(...)` for arrays/objects.
- (Never `disablePlugin` the plugin — see [T-L4] in Technical requirements.)

## Architecture

- **src/main.ts** — Plugin class, lifecycle (load/unload; registers renderers, commands, settings)
- **src/transforms.ts** — Parse/serialize the `{…}` attr_list block ↔ `ImageTransform` object
- **src/renderer.ts** — Apply transforms to the DOM (rotate-box span for quarter-turns, crop wrapper, inline styles)
- **src/renderer-logic.ts** — Pure reflow geometry (`rotatedBox`), unit-tested
- **src/live-preview.ts** — CM6 StateField block-widget: renders each image line (native embed + transform + toolbar/resize/`<>`/link-editor), overrides Obsidian's embed
- **src/live-preview-logic.ts** — Pure line→decoration logic (`lineDecorations`, `rewriteWidth`), unit-tested
- **src/toolbar.ts** — Hover-triggered toolbar with Lucide icons
- **src/link-reveal.ts** — `<>` toggle: editable raw-link text above the image
- **src/crop-editor.ts** — Custom crop UI (fixed frame, movable/rotatable/scalable image)
- **src/filter-panel.ts** — Side panel with sliders, presets, live histogram
- **src/export.ts** — Canvas-based export to a new image file
- **src/size-modal.ts** — Custom-size sub-menu (anchored under the toolbar, not a centered modal — see D8)
- **src/image-resolver.ts** — Map DOM img ↔ markdown source position
- **src/snippet-scanner.ts** — Discover CSS classes from vault snippets
- **src/styles-injector.ts** — Inject internal CSS classes (lie-* prefix)
- **src/editing-toolbar-integration.ts** — Optional editing-toolbar plugin hookup (manual, off by default)
- **src/commands.ts** — Obsidian command registration (checkCallback)
- **src/settings.ts** — Plugin settings tab
- **src/dev-bridge.ts** — CDP relay, dev builds only (tree-shaken out of production)
- **src/i18n/** — Translations (`index.ts`, `en.ts`, `de.ts`; follows Obsidian locale, English fallback)

---

# Requirements

These are hard requirements established with the user — **regressing any of them is a bug**. They are split into **functional** (what it does), **design** (how it looks / UX), and **technical** (how it must be built). Technical items tagged **[LEARNED]** encode lessons from concrete past failures — treat them as non-negotiable so the same mistakes are not repeated.

## Functional requirements

- **F1 — Non-destructive.** Editing only writes a trailing `{…}` attribute block; the image file, alt text, path and native `|size` are never altered.
- **F2 — Transform set.** Rotate (cw/ccw, quarter-turns), flip (horizontal/vertical), free-rotation crop, resize (width, aspect-ratio kept), and CSS filters.
- **F3 — Both views.** Rotation, flip, filters, crop and sizing render in **both** reading view and live preview, identically.
- **F4 — Link form follows Obsidian.** Whether markdown `![](…)` or wikilink `![[…]]` is used is decided by Obsidian's central "Use [[Wikilinks]]" setting. When the setting is switched, conversion between the two formats must keep the transform block intact and correct.
- **F5 — `<>` link reveal.** Reveals the raw link as editable text that writes edits back to the document; the image updates live. Obsidian's own cursor-driven edit reveal stays replaced by ours. The reveal has **three per-image modes**:
  - **ON** — once shown via `<>`, the text field stays visible.
  - **OFF** — once hidden, it stays hidden.
  - **AUTO (default)** — shows/hides together with the toolbar, i.e. when the image is selected.
- **F6 — Filters.** brightness 0–2 (default 1), contrast 0–2 (1), saturate 0–3 (1), hue-rotate 0–360deg (0), blur 0–10px (0), grayscale 0–1 (0), sepia 0–1 (0); temperature is an approximation that nudges the other sliders. Presets: Sepia, B&W, Vintage, Cool, Warm.
- **F7 — Crop.** Free crop: a movable/rotatable/scalable original under a resizable frame; output is `x, y, w, h` (relative to original) + rotate + scale. Aspect presets 16:9, 4:3, 1:1. **The dragging and rotating of the image itself snaps to whole-pixel / fixed-angle steps live, during the interaction** — not just by rounding the final output. The point is that the cut can never fall mid-pixel in the first place: position quantized to integer pixels, rotation to 0.1° steps, applied continuously while the user moves/rotates.
- **F8 — Export.** Canvas render of all transforms + filters to a new vault file `{original}-edited.{ext}`; original untouched.
- **F9 — Preset classes.** Built-in toggleable classes injected at runtime: `lie-small/medium/large` (max-width), `lie-left/right/center/inline` (float/align), `lie-rounded/shadow/border/circle` (decoration). Reset restores defaults.
- **F10 — Vault-snippet classes.** Discover external image CSS classes from `.obsidian/snippets/`; offer them in a dropdown; each is individually de-selectable in settings. Refresh on load and on file change.
- **F11 — Commands.** Registered with `checkCallback` (active only when an image is in context): `rotate-cw/ccw`, `flip-h/v`, `crop`, `filters`, `size-small/medium/large`, `class-left/right/center`, `add-class`, `reset`, `custom-size`, `toggle-inline`, `export` (all prefixed `obsidian-live-image-editor:`).
- **F12 — Settings page.** General toggle (hover toolbar on/off); snippet section (list of detected classes with per-class toggles, scanned-file status, refresh button, link to Obsidian's snippet management); editing-toolbar integration section (install/version status, enable toggle defaulting off, create/remove buttons, warning on untested versions).
- **F13 — i18n.** Follows Obsidian's language automatically; no language setting. Reuse Obsidian's own strings where possible; English fallback.

## Design requirements

*Toolbar*
- **D1 — Toolbar placement.** Sits at the top of the image and scrolls with it (not page-fixed), revealed on hover, inset from the image edge, with sensible icon spacing.
- **D2 — Toolbar icon order** (Lucide via `setIcon()`), left→right: `rotate-cw`, `rotate-ccw`, `flip-horizontal`, `flip-vertical`, `crop`, `sliders-horizontal`, `minus`, `plus`, `maximize`, `layout-list`, `chevron-down`, `download`, `undo-2`, then `<>` at the far right with extra spacing (where Obsidian's native edit button used to be).
- **D3 — Grouped toolbar buttons with overflow submenu.** Related buttons are grouped, and when there's not enough horizontal space a group collapses into a submenu (rather than wrapping or being clipped):
  - **Layout group:** left, center, right, inline/block.
  - **Edit group:** rotate, crop, mirror (flip).

*`<>` link reveal*
- **D4 — `<>` reveal appearance.** The editable raw link appears as text **ABOVE** the image (image stays visible below): borderless, full content width, left-aligned, auto-height (wraps fully, never clipped) — reads like a regular document line, **not** a bordered/resizable textfield. Fresh reveal autofocuses; committing or clicking away does not steal focus back. The current reveal mode (ON / OFF / AUTO, per F5) must be visible on the `<>` control itself via icon and/or colour.

*Panels & sub-menus*
- **D5 — Filter panel appearance.** PhotoDirector-style panel docked to the side of the image/crop frame: dark, narrow; live RGB histogram (canvas) at top; vertical sliders grouped Light / Color / Effect; double-click a slider resets to default.
- **D6 — Panel/reveal toggles.** The filter panel is a click-to-open / click-to-close toggle bound to the toolbar's visibility. The `<>` control is tri-state (F5: ON / OFF / AUTO) rather than a plain toggle.
- **D7 — Toolbar activation area includes the filter panel.** The toolbar hides when the image loses hover/selection. Because the filter panel sits **outside** the image, the toolbar's activation/hover region must **extend to include the panel** — otherwise moving the pointer from the image to the panel would dismiss both before it can be reached. Image + toolbar + open filter panel form **one continuous active region**.
- **D8 — Anchored sub-menu pattern (shared by all panels).** Modal-like controls do not open as a centered dialog. While one is open the toolbar is **greyed out and inactive**, and confirm / cancel are shown as **icons** (not text buttons). **Placement is the only thing that varies, and only because of size:** compact ones hang as a sub-menu **under the toolbar**; a large one (the filter panel) is shown **beside the image** instead — otherwise it uses the exact same logic/component (open/close toggle, greyed toolbar, icon confirm/cancel). Cases:
  - **Custom size:** compact, under the toolbar; offers the quick choices small / medium / large / original (plus custom width entry).
  - **Crop toolbar:** compact, under the toolbar; same behaviour.
  - **Filter panel:** same logic, but docked **beside the image** (D5) because it's too large to hang under the toolbar; its activation area is part of the toolbar's (D7).
- **D9 — Sub-menus must always be fully visible.** Every sub-menu, **including the filter panel**, is shown in full — **never clipped and never internally scrolled** (no scrollbar inside the menu panel). The filter panel in particular must size its **width dynamically** so translated (i18n) labels always fit, since string lengths vary by locale.
- **D10 — Consistent design *and* behaviour = one shared component (DRY).** The whole UI must look and behave consistently. The anchored-sub-menu / greyed-toolbar / icon-confirm-cancel behaviour (D8) is **one shared component reused** by size, crop and any future panel — never reimplemented per feature. Behaviour is part of this: every sub-menu opens and closes by the **same on/off toggle** as the filter panel (D6) — clicking its trigger again closes it — and **Esc closes any sub-menu as "cancel"** (discards, no commit). All sub-menus follow one consistent interaction model. This is a design requirement *and* a DRY technical requirement (see T9 and Working style: DRY).

*Image rendering & interaction*
- **D11 — Crop visuals.** On activation the image keeps its exact size/position (no jump, no reflow); crop mode overlays the current state. The frame's normal resize handle drives the cutout exactly as image-resize did before. The original image has corner handles (aspect-ratio-locked), edge handles (single-axis), free drag, a rotate handle, and scroll/pinch to scale. Area outside the frame is semi-transparent, inside is full opacity.
- **D12 — Rotated width parity.** A quarter-turn-rotated image is the **same width as a normal image** (true content width of the `.image-wrapper` content box, padding subtracted), and stays dynamic/responsive — no fixed-width wrapper forced on every image.
- **D13 — No scroll jump.** Toolbar edits and resizes must not jump the scroll position, and must not move the editor cursor.
- **D14 — Mobile.** Long-press substitutes for hover to reveal the toolbar.

## Technical requirements

### Core technical requirements (fixed)

- **T1 — Two render paths.** Reading view: `registerMarkdownPostProcessor()` on rendered sections. Live preview: the CM6 StateField widget (T-L1/T-L2). Both must produce the same DOM (T-L7) and the same visual result (F3).
- **T2 — Rendering contract is CSS custom properties.** The `.lie-img` rule in `styles.css` consumes `--lie-rotate`, `--lie-flip-*`, `--lie-brightness`, etc. Values stay structured (e.g. `--lie-rotate: 90deg`) so the filter sliders, crop editor and canvas export can read them back. Shipping that CSS in a MkDocs theme renders images **without the plugin**.
- **T3 — Rotation reflow needs a JS wrapper.** Pure CSS can't reflow a rotated box, so the `.lie-rotate-box` span is computed in JS (`renderer.ts` / `renderer-logic.ts`), scaled to the column width (Obsidian has no horizontal scroll). Consequence: MkDocs won't reflow rotated images by CSS alone.
- **T4 — Crop needs a wrapper div** (overflow + translate), making crop the least portable feature.
- **T5 — Resize handle.** Changes width, keeps aspect ratio, persists into `{…}`, works on rotated images (the dragged width is the bounding-box width), no scroll jump.
- **T6 — Snippet scanner.** Reads `.css` from `.obsidian/snippets/` via the vault adapter; pattern-matches image classes (`img.class`, `.class img`, `img[alt*=]`, property-based); filters out `lie-*` and Obsidian-internal classes; updates on load + file-watcher.
- **T7 — Editing-toolbar integration is optional, off by default**, version-gated (only tested versions, warn otherwise), and writes commands carrying the image-context condition.
- **T8 — No runtime dependencies.** The crop editor is custom (no Cropper.js); the histogram and export are canvas-based.
- **T9 — Shared sub-menu component.** The anchored sub-menu / greyed-toolbar / icon-confirm-cancel behaviour (D8/D10) is implemented **once** as a reusable component and consumed by the size and crop sub-menus (and future ones) — not duplicated per feature.
- **T10 — ESLint config stays as shipped** by the Obsidian sample plugin — do not modify it.
- **T11 — Obsidian core does not parse `{…}`** — the plugin must render it itself (reading view: post-processor; live preview: CM6 extension). This is *why* T1's two render paths exist.
- **T12 — Link conversion** (when the wikilink setting demands it, per F4) goes through `fileManager.generateMarkdownLink`, defensively — falls back to leaving the link as-is, and never uses the `alias` arg (T-L5).

### [LEARNED] — hard constraints from past failures

*This list is expected to grow as new mistakes are caught; the core requirements above are fixed.*

- **T-L1 — The live-preview widget must ALWAYS replace the image line.** Rendering is one CM6 block-widget (StateField + `Prec.highest`) that `Decoration.replace`s the whole `![…](…){…}` / `![[…]]` line. *Verified via CDP:* if the line is left un-replaced, Obsidian renders its **own native inline image** and leaves the trailing `{…}` as visible text behind it ("`{}` hinter dem Bild", which the user rejects). CM decorations cannot suppress this — Obsidian renders embeds from the document syntax tree, not the decorated DOM. **Do not** try to "fix" this by switching to native rendering. The `<>` reveal therefore lives *inside* the widget (editable link above, image kept), because showing the full raw link inline as real document text is impossible in live preview without Obsidian re-inserting the image (that only works in source mode, which the user rejected).
- **T-L2 — Use a StateField block-replace widget, NOT a ViewPlugin.** ViewPlugins cannot provide block decorations. Rebuild the StateField on `docChanged || selection change || editorLivePreviewField change` (mode toggle). The active line / source mode instead get a `Decoration.mark({class:"cm-string cm-url"})` on the `{…}` so it reads as part of the link.
- **T-L3 — Store transforms only in the trailing `attr_list` block.** Canonical: `![alt](path){.lie-img style="--lie-rotate: 90deg; --lie-brightness: 1.2;"}`. Never encode transforms in alt text or via wikilink pipe tricks — they must be portable (Python-Markdown `attr_list`, MkDocs/Material, Pandoc). Alt text and native `|size` are never touched; link type is preserved as-is (never auto-converted) so it respects the central wikilink toggle automatically.
- **T-L4 — Never `disablePlugin` the plugin via CDP.** The dev-bridge relay runs *inside* the plugin, so disabling it locks you out of CDP — and the disable persists (a reload won't restore it; the user must re-enable it in Settings → Community Plugins). To observe native behavior, leave one line un-decorated and inspect, or read Obsidian's app.js; use `location.reload()` for a clean reload.
- **T-L5 — Don't route a wikilink's `|size` through `generateMarkdownLink`'s `alias` argument.** That puts the size into the alt text. (This was *our* bug, not verified Obsidian behavior — see Working style: distinguish verified platform behavior from our own implementation.)
- **T-L6 — Test behavior via pure logic, not CDP.** CM6/Obsidian integration isn't unit-testable in vitest (`obsidian` / `@codemirror` don't resolve there). Extract every decision into a pure `*-logic.ts` file and unit-test that. Current targets: `transforms.ts` (parse/serialize round-trips, edge cases), `renderer-logic.ts` (`rotatedBox` geometry), `live-preview-logic.ts` (`lineDecorations`, `rewriteWidth`). CDP is only the final integration sanity-check.
- **T-L7 — One consistent DOM structure for every image** — normal, cropped or rotated alike: a `.lie-rotate-box` span (reserves the rotated bounding box) wrapping the `.image-wrapper` wrapping the `img.lie-img`, with toolbar/handles/`<>` attached. Don't branch the structure per state.

---

# Known bugs / open issues

Currently-known defects against the requirements above. Remove an entry once it's fixed *and* covered by a test (T-L6).

*None currently open.* (B1 and B2 below are fixed — kept briefly for context; remove on next pass.)

- **B1 — Filter-panel sliders have no effect.** *Fixed.* Sliders now drive a **live preview**: each change calls `FilterPanel`'s `onPreview` → `applyFilterVars` (renderer) sets the `--lie-*` custom properties straight on the image (no document round-trip), so the pixels change immediately. The non-default-filter → `--lie-*` mapping is one shared pure helper (`filterToVars` in `transforms.ts`, reused by the renderer's DOM apply, the live preview and the canvas export) and is unit-tested (`tests/transforms.test.ts`). The panel persists once, on **commit** (confirm icon / close-to-keep); **cancel**/Esc reverts.
- **B2 — Filter panel not dismissed on context loss.** *Fixed.* The panel is bound to the image+toolbar active region (D7) and dismissed on context loss: `dismissToolbar()` closes it; the click-outside / overlay-opened / window-blur handlers close it even when the floating toolbar isn't shown (live-preview case, where the chrome lives in the widget); selecting another image commits-and-closes it. Clicking inside `.lie-filter-panel` is treated as part of the active region, so interacting with the panel doesn't dismiss it. (Integration behavior — not unit-testable per T-L6; verify via CDP.)
- **B3 - Filter panel does not allign with the image.** When scrolling, die panel is fixed on page and does not move with the image.
- **B4 - Filter panel does not hide with toolbar.** The panel should behave like a submenu and show/hide wenn the toobar shows hides. The enabled state, which determines if it will be shown at all, is independet from that. -> when disabled, not shown at all. When enabled, shown when the toolbar is shown, and hidden when the toolbar is hidden.

## Conventions

- Plugin ID: `obsidian-live-image-editor`; internal CSS class prefix: `lie-`.

## Working style (established with the user)

- **Write automated tests for behavior changes.** Don't rely on manual CDP checks alone — they don't prevent regressions. Extract decision logic into pure `*-logic.ts` files and test with vitest (see T-L6). Run `npm test` and report results.
- **Research before trial-and-error.** For unfamiliar platform/API internals (e.g. how Obsidian renders embeds in CM6 live preview), research and reason it through FIRST (docs, how other plugins do it), form a verified mental model, then write code once. Blind iterate-until-it-works on platform internals is "terribly inefficient" — reserve CDP/empirical checks for *verifying* a hypothesis.
- **DRY, not "avoid features."** Code minimization means the same logic must not appear twice (inheritance, shared helpers, wrappers, reuse of platform code like Obsidian's `MarkdownRenderer`) — it does NOT mean dropping a feature because it's more code. Never argue against implementing something on "more code" grounds; factor out shared logic instead.
- **Distinguish verified platform behavior from our own implementation.** State only what you've actually verified. Don't attribute a result to Obsidian/the API when it's a consequence of our own code; if you haven't tested the platform's behavior, say so (this is exactly what caused T-L5).
- **Prefer portable/native syntax.** The user publishes the same notes via MkDocs/Material (`attr_list`); the markdown must render correctly there without the plugin. When an Obsidian-only shortcut and a portable-but-more-work option both exist, surface the trade-off and lean portable.
- **Dry-run critical operations before the hot run.** For destructive or irreversible commands (delete/`rm`, overwrite, move, mass edits), **double-check that the planned command does only what it's meant to** before executing it. First inspect the actual targets (`ls`/`find`/`git status`, or `rm` with the paths echoed / `--dry-run` where available), confirm the match list is exactly the intended set, and only then run the real command. Never name a folder in a plan/option by an assumption about its contents — verify what's inside first (e.g. `~/.claude/projects/` held session transcripts, not only memory; deleting the whole tree destroyed sessions the user wanted to keep).
