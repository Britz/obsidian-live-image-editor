# Open Items & Registry — Live Image Editor

> The single backlog + registry for the plugin, in two parts:
>
> 1. **OPEN — checklist at the top.** Everything still to do, as `- [ ]` items grouped by kind
>    (open decisions, verifications, deferred ideas, DRY/KISS, known open bugs). Tick them off as
>    they land. Items marked **(verify)** could not be confirmed from code/commits and need a check.
> 2. **SOLVED / DONE — registry at the bottom.** Everything already resolved, kept on purpose with
>    its **cause + fix** so the same mistake is not made twice. The hard-won lessons keep their
>    **L1–L12** numbers and the bugs keep their **Bug N** numbers — other docs (`architecture.md`,
>    `implementation-plan.md`, `test-plan.md` via `T-Ln`) reference these, so the numbers must keep
>    resolving to content here.
>
> Migrated out of CLAUDE.md (now the build/debug guide only) and merged from the former
> `issues.md` + `open-items.md`.

---

## OPEN

### Open decisions

- [ ] **Display-mode residual (AD3, minor).** The uniform box computes to `display:block` on a plain
      page vs `inline-block` where an alignment class is present — harmless given the explicit px
      width, but a residual special case worth tidying.

### Verifications (need eyes on a real / focused window)

- [ ] **Reading-view focused-window pass.** Reading view renders only when visible, so it does not
      render in a backgrounded/headless CDP window. The live reading-view render, captions on a real
      captioned image, float/inline there, and the interactive panels (crop / filter / size) plus the
      native save dialog (F13, not CDP-reachable) were verified only via live preview (shared code) —
      need a focused-window / manual pass. The pure logic each depends on is unit-tested.
- [ ] **Crop responsive scaling (#7).** Box-relative `translate%` + `width:100%` img should rescale a
      crop as the column narrows; structurally correct but not yet measured under a narrowing column.
- [ ] **Caption pure-CSS sizing** against the implemented new DOM (verified in isolation, not the
      real structure).
- [ ] **Toolbar container-query** with the box's aspect-ratio height (tested with an explicit px
      height, not the derived one).
- [ ] **`.cm-active` lock-step (verify).** Confirm the reveal class flips in lock-step with
      Obsidian's own source-reveal across edge cases (fallback signal: native widget DOM presence via
      `:has()`). Largely addressed by the HEAD pure-CSS model (`.cm-line:has(> .cm-formatting)`), but
      worth a final empirical confirm.

### Known open bugs

- [ ] **Toolbar missing on small / inline images (≤311px wide, and inline icons).** In live preview
      the editing toolbar does not appear on images ≤311px wide or on inline icons. Root cause: the
      block widget's wrapper has `contain: paint` (Obsidian's own rule on block widgets,
      `.cm-content > [contenteditable="false"]`), which clips the toolbar when the reflow positions it
      *above* the image (too-small handling). The existing padding-bottom trick rescues the bottom
      overflow but not the top-positioned bar.
- [ ] **Bug 25 — rotate/flip drifts an already-cropped image out of frame.** Rotating/flipping an
      already-cropped image via the toolbar drifts it out of frame: the crop renders with a top-left
      origin, so a composed rotate/flip doesn't pivot about the frame centre. Needs centre-origin
      composition (or baking the rotation into the crop params) — a focused follow-up, not rushed.

### Deferred design / elegance (DEFER)

- [ ] **Toolbar unification:** one CSS positioning mechanism for both views (currently two).
- [ ] **Crop-in-place** vs the mirroring overlay (the overlay duplicates the box+img geometry).
- [ ] Smaller chrome unification: resize handle, anchored sub-menu, filter-panel docking — all anchor
      to the uniform box.

### Under-specified details (SPEC)

- [ ] Exact **crop serialization** tokens (how the cut-frame aspect + placement sit in the attr block).
- [ ] Shared **sub-menu host** component API (D6 / F14).
- [ ] **Link-form conversion** edge cases (F5 / F6).

### Housekeeping (CHORE)

- [ ] **Test Plan** (`documentation/test-plan.md`): a **draft** only — review/validate together; the
      actual tests aren't written.
- [ ] **CLAUDE.md doc-map cross-references.** CLAUDE.md still points at `documentation/issues.md`
      (the Documentation map and the L4 note); update those to `open-items.md` after this merge.

### DRY/KISS audit — not yet acted on (2026-06-02)

A verified audit of `src/` against the supreme directive. **Against the OLD code** — many dissolve in
the rebuild, but each is a concrete "do it once" the target must keep honouring. Per `methodology.md`,
first check whether each traces to a missing requirement/architecture point, then consolidate.
*(File:line were the audit-time state — re-confirm before editing.)*

Geometry & transforms — one source:
- [ ] `export.ts` `canvasFilter` re-lists the filter functions / units / defaults that `transforms.ts`
      and `styles.css` already encode → reuse a shared `canvasFilterString` from the filter table.
      *(Note: HEAD's export reuses `renderer-logic` + the native filter string — re-confirm what
      remains.)*
- [ ] `export.ts` rotation branch recomputes the rotated bounding box that `renderer-logic.ts`
      `rotatedBox` already provides → call `rotatedBox(...)`. *(Re-confirm against HEAD export.)*
- [ ] "filter ≠ default" iterated 4× (`serializeTransform` / `isDefaultFilter` / `filterToVars`, and
      `filter-panel.ts` `currentFilter`) → one `nonDefaultFilter()` helper. *(`filterToVars` is gone
      at HEAD — re-confirm the remaining call sites.)*

`main.ts` panel openers:
- [ ] `customSize`, `crop`, `toggleFilters`, `addClass`, `exportImage` each re-implement the
      `activeImage → view → editor → findImageInSource → parseAltText` boilerplate that
      `resolveLocation()` already encapsulates (and silently drop its Notice) → funnel through it.
- [ ] `addClass` builds a 4th ad-hoc popup (own outside-click / zIndex / Esc) next to the toolbar
      group popup and the anchored sub-menu → one shared popup/host (ties to D6 / F13).

UI building blocks:
- [ ] Icon-button build repeated 3× in `anchored-submenu.ts` `buildHeader` → one `iconButton()`.
- [ ] Text/preset-button build repeated in crop / size / filter panels → one `textButton()`.
- [ ] Filter-panel slider row duplicated (temperature + normal) → one `sliderRow()`.
- [ ] `crop-editor.ts` teardown duplicated in `close()` and `confirm()` → one `teardown()`.
- [ ] `styles.css`: ~5 button classes repeat radius / cursor / `:hover` → one base `.lie-btn` + variants.

Behaviour-near (verify carefully — L8 / L10 / Bug-2 territory):
- [ ] `caption.ts` tracks the box width with its own rAF + `setTimeout` polling **and** a
      `ResizeObserver`, duplicating what the box computes → couple the caption width to the box.
      *(The HEAD aspect-ratio model removes most of this; re-confirm what's left.)*
- [ ] Embed-matching regexes scattered across `caption-logic.ts`, `live-preview-logic.ts`,
      `image-resolver.ts`, `live-preview.ts` → share an embed-token sub-pattern (capture groups
      differ, so do **not** force one single regex).

> **Rejected during the audit (do NOT chase):** a "second `resolveEmbedFile` in `live-preview.ts`"
> (doesn't exist — that line is `writeWidth`); and the floating toolbar vs the in-image toolbar are
> **not** a duplicate (both build via `buildToolbarElement`).

---

## SOLVED / DONE

> Resolved work, kept as the cause+fix record. The **L1–L12** lessons and **Bug N** numbers are
> referenced by other docs and must keep resolving here. Status legend on bugs: **SOLVED**
> (code-verified) · **SOLVED✓CDP** (verified live in Obsidian).

### Big milestones — landed

- [x] **The rework — landed (2026-06-03).** The code matches `implementation-plan.md`'s target; the
      unit tests were rewritten for the new pure logic (97 passing). Vs the old model:
      - **Native CSS storage** — `transform`/`filter` stored verbatim in `style=` and routed to the
        img by property name; `--lie-*` props, `filterToVars`, `FILTER_VAR_NAMES`, the separate
        `CropData` type are **gone**. Crop is the same uniform geometry (explicit `translate()/scale()`
        in the img transform + a `width/height` cut frame).
      - **Declarative box→image sizing** — the box's `aspect-ratio` is derived from the intrinsic ratio
        (+ angle) via `renderer-logic.ts` (`boxAspectRatio`/`innerImageSize`) and applied as
        `--lie-auto-aspect`; the inner image sized in box-relative `%`. The JS measure-retry loop /
        rAF+setTimeout / `ResizeObserver` sizing is **removed** (intrinsic read once on load).
      - **Pure-CSS caption** — `width:0; min-width:100%` inside the shrink-wrapping host; the JS
        width-sync/poll/`ResizeObserver` is gone.
      - **LP overlay + native edit** — see L11/L11b; reveal-for-looking is a display-only fake link +
        binary `<>` toggle keyed by static CSS, with a global default-state setting.
      - **Export** reuses `renderer-logic` + the native `filter` string, renders at the original
        resolution; the duplicate crop/rotate math is gone.
      - **Size presets** (icon/small/medium/large/original) apply via re-themeable `--lie-size-*` vars;
        settings add preset widths, the default reveal state, and bundled snippet install/reset
        (opt-in). Snippet discovery scans only Obsidian-**enabled** snippets.
      - CDP-verified (Obsidian 1.12.7): declarative geometry holds (normal `300px`→box `300×200`;
        `rotate(90deg)` of a 1.5 landscape→box `200×300`, img `150%/66.67%`,
        `--lie-auto-aspect:0.667`; flip→box `120×180`) — all from the intrinsic ratio, no
        measure-then-resize. Crop is native + clipped (`overflow:hidden`, top-left origin +
        `translate()/scale()`).

- [x] **CLAUDE.md cleanup (2026-06-02).** Slimmed to a lean build/debug guide (Project, Build & Test,
      CDP) + a documentation map. The old duplicated requirements/architecture/known-bugs were removed.

- [x] **R0 + F22/D9 captions (CDP-verified).** One uniform box for every image (the `display:contents`
      "normal" special case removed); alt text → Markdown caption, centred, wraps within the image
      width, settings toggle, off by default.

### Resolved decisions (formerly DECIDE / FOLD)

- [x] **Reveal/edit model — overlay + CSS reveal + native edit (landed at HEAD).** Supersedes the
      earlier "native path CLOSED → self-built field" conclusion. The LP adapter **does not replace**
      the line (AD5): Obsidian renders its own (CSS-suppressed) native embed and provides the
      cursor-reveal; the plugin overlays its own image. Reveal-for-looking (F8) is a display-only fake
      raw link + the `{…}`, with a **binary** `<>` show/hide toggle (not persisted per image) and a
      global default-state setting (AB19/F20); per-line display mode lives in a CSS class
      (`lie-rev-auto|always|hidden`). No tri-state `RevealMode` cycling — `cycleRevealMode` is gone
      (code: `src/live-preview.ts`). Editing (F9) is Obsidian's native cursor-reveal of the source as
      real document text (works standalone + inline). `{…}` (F3) is hidden by CSS when rendered, shown
      on the active line. *(Now fully declarative in CSS — the fake link yields to the native source
      via `.cm-line:has(> .cm-formatting)`; commit 15bdac9.)*

- [x] **Temperature — KEPT as a virtual control (F11), code-verified.** The DECIDE asked "drop, or keep
      via the harder route?" — the code keeps it: `temperatureAdjust` lives in `src/transforms.ts`
      and *nudges* hue/saturate/brightness (it is a virtual control, not a native white-point shift).
      The filter-panel temperature **slider** shares the row markup but isn't a `SLIDERS` entry. *(Note:
      Bug 15 "temperature removed" in the post-rework round referred to a transient removal; the
      control is present at HEAD — `src/filter-panel.ts`, `src/i18n/*`. If a true drop is still wanted,
      reopen.)*

- [x] **#1 Export resolution (F13 / AB15 / §3.4).** Export from the original image's native resolution
      (highest quality; display size never reduces it).
- [x] **#4 Inline ≠ size; uniform chrome.** Inline (flows in text) and size (a preset) are orthogonal;
      no "chrome skipped for inline" special case — every image treated the same (R0). → folded into
      F17/F24/AB9/§3.3.
- [x] **#5 Routing rule.** Image = box; everything goes to the box except `transform` and `filter`
      (→ image). Unexpected style property → box. Classes: marker on the image; alignment/inline →
      the embed. → §2.3 routing + AD2.
- [x] **#6 Snippets (F16 / F16.1).** Install copies shipped CSS into the snippets folder without
      force-overwrite (a restore of deleted files; same-named file left as-is). Reset is per-file to
      the shipped original (diff-detected). Plus: hide the add-class dropdown when no snippets apply;
      only scan/offer snippets enabled in Obsidian. → F16/F16.1/AB4/§3.1.
- [x] **#7 Crop pixel-quantization (F12).** Cut quantizes to whole pixels + fixed angle steps live
      during the interaction (present). Responsive box-relative scaling is the open VERIFY above.

### Solved bug from the DRY/KISS audit

- [x] **Latent box-selector bug (`main.ts` `previewSize`).** It queried a non-existent class
      `.lie-image-area-rotate` so the size-preview missed the box on rotated images. At HEAD the
      renderer exports `BOX_CLASS = "lie-image-area"` and `main.ts` queries `.lie-image-area` — the
      magic-string mismatch is resolved (still worth a single `visibleBox()` helper — see DRY list).

### Hard-won lessons (L1–L12) — must never be re-broken

These were tagged `[LEARNED]` / `T-Ln`. Each is a *bug class* + the rule that prevents it; the
architecture encodes most in its decisions (`AD…`).

- **L1 — An un-replaced image line re-fires Obsidian's native embed (now WANTED).** *Observation
  (still true):* an un-replaced line makes Obsidian render its own native embed and leave the trailing
  `{…}` as visible text (CDP-verified). *Superseded conclusion:* the old "always replace the whole
  line" fix is gone. The native embed is now **embraced** (it loads the image and gives Obsidian's own
  cursor-reveal of the source); the plugin draws its OWN transformed image as the R0 overlay widget
  and **suppresses** the native image with scoped static CSS (hides Obsidian's `.image-wrapper`, never
  the plugin's `.lie-wrapper`); the `{…}` is real document text hidden by CSS while rendered, shown
  when the line is active. (→ AD5.)
- **L2 — Use a StateField, NOT a ViewPlugin.** *Cause:* ViewPlugins can't emit block decorations.
  *Fix:* a StateField rebuilt on doc/selection/mode change; it adds the plugin's own overlay widget
  alongside the (CSS-hidden) native embed. Reveal-for-looking and the hide-when-rendered are static
  CSS keyed on hover/focus and `.cm-active`; editing is Obsidian's native cursor-reveal — no
  plugin-owned editable field. (→ AD5.)
- **L3 — Store transforms only in the trailing `attr_list` block.** *Cause:* encoding in alt text or
  via wikilink pipe tricks breaks portability (Python-Markdown / MkDocs / Pandoc). *Fix:* canonical
  `{…}` block; alt text / native `|size` never repurposed; link type preserved. (→ AD1/AD2, T2.)
- **L4 — Never `disablePlugin` the plugin via CDP.** *Cause:* the dev-bridge relay runs *inside* the
  plugin, so disabling it locks CDP out, and the disable persists across reloads. *Fix:* to observe
  native behaviour leave one line un-decorated; use `location.reload()` for a clean reload.
- **L5 — Don't route a wikilink's `|size` through the link-generator's `alias` argument.** *Cause:*
  it pushes the size into the alt text — *our* bug, not Obsidian behaviour. *Fix:* link conversion is
  defensive and never uses the alias arg. (→ AD9.)
- **L6 — Test behaviour via pure logic, not CDP.** *Cause:* CM6/Obsidian don't resolve in vitest.
  *Fix:* extract every decision into a pure `*-logic.ts` unit and unit-test it; CDP is only the final
  integration check. (→ AD7, T8.)
- **L7 — One consistent DOM structure for every image** (structural half of **R0**). *Cause:* a
  `display:contents` "normal" special case (no real box) caused divergence. *Fix:* the same real
  wrapper box for every variant; only size/transform differ, never the structure. (→ AD3.)
- **L8 — One render path per mode; no double-rendering.** *Cause:* two competing async passes
  re-measured the rotated box at different available widths → inconsistent box/image sizes. *Fix:* the
  live-preview overlay widget owns its own image; the reading-view reconcile skips the plugin's
  overlay images; no second retry beside the main one. (→ AD5.)
- **L9 — `params` passed to the attr parser must be the attr CONTENT, without the `{` `}` braces.**
  *Cause:* with braces left on, the first token becomes `{.class` (starts with `{`, not `.`) and is
  silently dropped, while `style="…"` still parses — so in live preview the standalone classes
  (alignment, decoration) vanished while rotate/flip/filter/size worked, masking it. *Fix:* strip the
  braces before parsing; regression test in `tests/live-preview.test.ts`. (Was the root cause of Bug 17.)
- **L10 — Layout/measure retries must not rely on `requestAnimationFrame`/`ResizeObserver` ALONE.**
  *Cause:* both are paused while the window is backgrounded/hidden (a second Obsidian window) → every
  image's box stuck at 0, captions left-aligned. Also: a cached image can be `complete` with
  `naturalWidth` momentarily 0 and no `load` event. *Fix:* schedule each retry via rAF **and** a
  `setTimeout` fallback (guarded); don't gate the loop on `naturalWidth`. *(The new
  box→image / aspect-ratio-from-intrinsic model removes most of this surface.)* (→ AD6.)
- **L11 — The live-preview adapter must NEVER replace the line; it OVERLAYS (AD5).** *Cause (the
  user's hard rule, validated over a long test session):* the only way to get native
  editable/selectable/copyable source text is to let Obsidian render its own embed and merely suppress
  it — a `Decoration.replace` (even of a non-active line) kills the native source, and a plugin-owned
  editable field reintroduces the caret seam. *Fix:* a **block widget** (`side: 1`, AFTER the line so
  the native source reveals ABOVE it and the overlay follows down) draws the plugin's own transformed
  image; CSS suppresses the native image AND the native edit-block-button
  (`.cm-content .internal-embed.image-embed > img, > .image-wrapper, > .edit-block-button`) — the
  markdown `<img>` is a direct child (no `.image-wrapper`), the wikilink wraps it; the
  edit-block-button is a `<>` icon that otherwise leaks (Bug 12). The `{…}` block is a
  `Decoration.mark` hidden by `.cm-line:not(.cm-active) .lie-attr-hidden` (F3), shown on the active
  line (F9). Reveal-for-looking is a display-only `.lie-fake-link` (toggle/default/hover).
  *(CDP-confirmed via screenshots.)*
- **L11b — Obsidian keeps an image EMBED rendered even on the active line; only the trailing
  `{…}`/alt become editable text** (CDP-verified, markdown + wikilink). So native editing covers the
  transform block (the plugin's data — what matters), not the `![…]`/`![[…]]` link itself, which stays
  a (suppressed) embed. Obsidian's behaviour, embraced as required.
- **L12 — `container-type: size` on the box works, but collapses to 0×0 when the box's pane is
  `display:none`.** Reading-view boxes measured 0×0 while the editor pane was the hidden one; in the
  visible pane they size correctly. Not a bug — a measurement caveat (measure in the visible pane).
- **Dev-process lessons.** (a) The **stale-build trap** — two quick saves under `dev:vault` can load
  an *intermediate* build (e.g. a function renamed at the call site but not the definition →
  `ReferenceError`), looking like "rendering broke"; force a clean `location.reload()`. (b) The **CDP
  relay (9222) flaps after a plugin reload** (old socket lingers in TIME_WAIT) — connect directly to
  `CDP_PORT=9223` until it recovers. (c) **Reading view does not render headless** — Obsidian's
  reading-view renderer is visibility-driven; a backgrounded/headless window leaves
  `.markdown-preview-sizer` empty, so verify that path in a focused window. (See CLAUDE.md → Live
  debugging.)

### Solved bugs — verification round (2026-06-01, via CDP)

Worked off one by one after running the plugin. (Bug 9 was intentionally absent.) Kept as the
cause+fix record so the same regressions aren't reintroduced.

| # | Symptom | Cause | Fix | Status |
|---|---|---|---|---|
| 1 | AUTO link reveal not shown on first render | `autoGrow` ran while the textarea was `display:none` → height pinned to 0 | OBSOLETE — superseded by the overlay reveal model: no plugin-owned textarea; editing is native cursor-reveal, reveal-for-looking is static CSS | SOLVED (n/a) |
| 2 | Rotated reflow box mis-sized | competing async passes re-measured at different widths (the `693px` was an export-test artifact) | single render path (reconcile skips widget images, duplicate `ensureBox` removed) + ResizeObserver recompute; no fallback to the transient parent width | SOLVED✓CDP |
| 3 | Filter panel mis-positioned / didn't track the image | left-flip + no scroll/hover handling | no left-flip (clamp right), hide when the image scrolls offscreen, visibility hover-bound to image+panel | SOLVED✓CDP |
| 4 | Crop broke on image drag | the crop frame ate the pointer events | frame `pointer-events:none`, handles re-enable it | SOLVED✓CDP |
| 5 | `+`/`-` size buttons unwanted | — | removed from the toolbar (resize via native handle + custom-size) | SOLVED✓CDP |
| 6 | Toolbar icons not visually grouped | no dividers | dividers between clusters (→ divider-wrapping) | SOLVED✓CDP |
| 7 | Filter-panel sliders overlapped | missing group spacing | `.lie-filter-group` spacing | SOLVED✓CDP |
| 8 | Temperature slider didn't move itself | sliders matched by DOM index | `refreshSliders()` matches by `data-key` | SOLVED✓CDP |
| 10 | Custom-size had no height field | — | width + height entries side by side | SOLVED✓CDP |
| 11 | Alignment (left/center/right) had no effect | float applied to the wrong element | `:has()` targets the embed container | SOLVED✓CDP |
| 12 | Resize affordance missing | shown only on `:focus-within` | use Obsidian's native handle + frame, shown on toolbar hover, hidden in crop | SOLVED✓CDP |
| 13 | Export failed when the target file existed | overwrite collision | superseded by the F13 save dialog (never overwrites silently) | SOLVED |
| 14 | Revealed link editor had a frame | inherited input styling | OBSOLETE — superseded by the overlay reveal model: no plugin-owned revealed-link editor; editing is native document text | SOLVED (n/a) |
| 15 | Image wider than the canvas when no size set | `width: max-content` on `.image-wrapper` | drop it; rely on native `div.image-embed { width: fit-content }` | SOLVED✓CDP |
| 16 | Resize frame offset from the image | `.image-wrapper` padding | zero the padding so `inset:0` hugs the image | SOLVED✓CDP |
| 17 | Standalone classes lost in live preview (regression of 11) | **L9** — the `{…}` braces were passed to the parser, dropping the leading `.class` token | strip the braces in `lineDecorations`; regression test | SOLVED✓CDP |
| 18 | Resized crop left an empty band (caption pushed below) | the box kept `crop.h` tall while content scaled with width | `cropBoxSize` aspect-correct when one dimension is given; unit-tested | SOLVED✓CDP |
| 19 | Inline (mid-text) image rendered native & full-size | `EMBED_LINE` only matched standalone lines → Obsidian drew its own | the **same** widget in an inline mode (`inlineEmbeds`), not a separate widget | SOLVED✓CDP |
| 20 | `lie-center` only centred *on hover* | Obsidian forces `.cm-content > * { margin: 0 !important }` → it beats `margin:auto`, so centring only took after a reflow | centre via `text-align:center` on a full-width (`width:100%`) block embed — no `!important` arms race | SOLVED✓CDP |
| 21 | Scroll jank; image sections render very late (live preview) | the block widget had no `estimatedHeight`, so CM6 modelled each off-screen image line as one ~14px text line; the box also grew 0→real after layout | `EmbedWidget.estimatedHeight` + `reserveBox` both derive from one pure `estimatedBlockHeight({crop,width,height})` (DRY, unit-tested; exact for crops via `cropBoxSize`); the async loop only refines it | SOLVED✓CDP |

### Solved bugs — post-rework round (2026-06-03, CDP+screenshot-verified)

A user test pass found 29 issues in the first rework; fixed and visually verified via
`scripts/obsidian-screenshot.mjs` (CDP `Page.captureScreenshot`).

- [x] **Reveal/edit model corrected to the true AD5 overlay** (L11) — was briefly mis-built as a
      block-replace + plugin textarea (reverted). Verified: reveal toggles (Bug 1), reveal/edit ABOVE
      the image (Bug 2/9), no native `<>` leak (Bug 12), no duplicate image.
- [x] **Bug 7 — Reset no longer whites-out the window** — `classList.add("")` on an empty class token
      threw in the CM update cycle; guarded.
- [x] **Bug 6 — Rotate centred** via `translate(-50%,-50%)` prepend (a >100%-wide rotated img
      left-aligned under `margin:auto`).
- [x] **Bug 13 — Snippet "png"** came from `img.png` in a CSS *comment* — strip comments + filter file
      extensions.
- [x] **Bug 27/28 — Captions** below the image, centred, width-limited, Markdown-rendered — pure CSS
      on a shrink-wrapping host.
- [x] **Bug 4 — Toolbar** anchored to the image top via the box; **Bug 5 — fold-then-wrap** (D2
      revised): a measured reflow folds groups to a submenu trigger (Layout→Edit) then lets
      `flex-wrap` wrap at the dividers — verified at 700/300/150px.
- [x] **Crop rebuilt** — FRAME is the fixed output (size = box, aspect = presets); handles SCALE the
      inner image toward the frame centre (Bug 17); committed result equals the framed region (Bug 19,
      screenshot-verified); the crop overlay is exempt from the dismiss handler (Bug 18/24).
- [x] **Bug 22/23 — Filter panel** gained the shared per-panel reset; **Bug 20** — size
      "Original"/cleared field no longer collapses the box; **Bug 16** — resize handle CSS;
      **Bug 26** — the three demo notes migrated to native syntax.

### Box rename + native-look resize handle — landed (commit 15bdac9)

- [x] **Box rename.** The uniform image box is now `.lie-image-area` (it handles the image) and the
      chrome container is `.lie-box` (the two swapped); `lie-rotate-box` / `ROTATE_BOX_CLASS` retired.
      Code: `renderer.ts` exports `BOX_CLASS = "lie-image-area"`.
- [x] **Native-look resize handle.** Restyled to match Obsidian's native image handle (rounded accent
      square, `--background-primary` fill + `--color-accent` outline), centred on the corner tip;
      padding-bottom + negative margin stops the block widget's `contain: paint` from clipping it.
      *(Note: the same `contain: paint` still clips the toolbar on small/inline images — see Known open
      bugs.)*
