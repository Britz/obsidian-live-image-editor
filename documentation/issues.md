# Issues — Live Image Editor

> The bug & lesson registry. Every defect and every hard-won lesson lives here — **solved ones
> kept on purpose**, each with a short **cause** and **fix**, so the same mistake is not made twice.
> A bug is removed from "open" only once fixed *and* covered by a test or CDP-verified; it then
> stays in "solved". (Migrated out of CLAUDE.md, which is now the build/debug guide only.)

Status legend: **OPEN** · **SOLVED** (code-verified) · **SOLVED✓CDP** (verified live in Obsidian).

---

## 1. Hard-won lessons (must never be re-broken)

These were tagged `[LEARNED]` / `T-Ln`. Each is a *bug class* + the rule that prevents it. The
new architecture encodes most of them in its decisions (`AD…`); kept here as the cause+fix record.

- **L1 — An un-replaced image line re-fires Obsidian's native embed (now WANTED).** *Observation (still
  true):* if the line is left un-replaced, Obsidian renders its **own** native embed from the document
  syntax tree and leaves the trailing `{…}` as visible text (CDP-verified). *Superseded conclusion:* the
  old fix ("therefore always replace the whole line; the reveal lives inside the widget") is gone. The
  native embed is now embraced — it provides the image load and Obsidian's own cursor-reveal of the
  source. We do NOT replace the line: the plugin draws its OWN transformed image as an overlay (the one
  uniform R0 widget) and SUPPRESSES the native image with static, scoped CSS (hides Obsidian's
  `.image-wrapper`, never the plugin's own `.lie-wrapper`); the `{…}` is real document text hidden by
  the same CSS while rendered and shown when the line is active. (→ AD5.)
- **L2 — Use a StateField, NOT a ViewPlugin.** *Cause:* ViewPlugins can't emit block decorations.
  *Fix:* a StateField rebuilt on doc/selection/mode change; it does NOT replace the line — it adds the
  plugin's own transformed-image overlay widget alongside the (CSS-hidden) native embed. Reveal-for-
  looking (the display-only fake raw link plus `{…}`) and the hide-when-rendered of the source/`{…}`
  are driven by static CSS keyed on hover/focus and `.cm-active`; editing is Obsidian's own native
  cursor-reveal of the source as real document text — no plugin-owned editable field. (→ AD5.)
- **L3 — Store transforms only in the trailing `attr_list` block.** *Cause:* encoding in alt text or
  via wikilink pipe tricks breaks portability (Python-Markdown / MkDocs / Pandoc). *Fix:* canonical
  `{…}` block; alt text / native `|size` never repurposed; link type preserved. (→ AD1/AD2, T2.)
- **L4 — Never `disablePlugin` the plugin via CDP.** *Cause:* the dev-bridge relay runs *inside* the
  plugin, so disabling it locks CDP out, and the disable persists across reloads. *Fix:* to observe
  native behaviour leave one line un-decorated; use `location.reload()` for a clean reload.
- **L5 — Don't route a wikilink's `|size` through the link-generator's `alias` argument.** *Cause:*
  it pushes the size into the alt text — this was *our* bug, not Obsidian behaviour. *Fix:* link
  conversion is defensive and never uses the alias arg. (→ AD9.)
- **L6 — Test behaviour via pure logic, not CDP.** *Cause:* CM6/Obsidian don't resolve in vitest.
  *Fix:* extract every decision into a pure `*-logic.ts` unit and unit-test it; CDP is only the final
  integration check. (→ AD7, T8.)
- **L7 — One consistent DOM structure for every image** (structural half of **R0**). *Cause:* a
  `display:contents` "normal" special case (no real box) caused divergence. *Fix:* the same real
  wrapper box for every variant; only size/transform differ, never the structure. (→ AD3.)
- **L8 — One render path per mode; no double-rendering.** *Cause:* two competing async passes
  re-measured the rotated box at different available widths → inconsistent box/image sizes (a
  rotation-sizing bug). *Fix:* the live-preview overlay widget owns its own image; the reading-view
  reconcile skips the plugin's overlay images; no second retry beside the main one. (→ AD5.)
- **L9 — `params` passed to the attr parser must be the attr CONTENT, without the `{` `}` braces.**
  *Cause:* with braces left on, the first token becomes `{.class` (starts with `{`, not `.`) and is
  silently dropped, while `style="…"` still parses — so in live preview the standalone classes
  (alignment, decoration) vanished while rotate/flip/filter/size worked, masking it. *Fix:* strip the
  braces before parsing; regression test in `tests/live-preview.test.ts`. (Was the root cause of Bug 17.)
- **L10 — Layout/measure retries must not rely on `requestAnimationFrame`/`ResizeObserver` ALONE.**
  *Cause:* both are **paused while the window is backgrounded/hidden** (a second Obsidian window) →
  every image's box stuck at 0, captions left-aligned. Also: a cached image can be `complete` with
  `naturalWidth` momentarily 0 and **no `load` event** coming. *Fix:* schedule each retry via rAF
  **and** a `setTimeout` fallback (guarded); don't gate the loop on `naturalWidth`. *(Diagnosed via
  CDP: rAF callbacks never fired because the window was behind another.)* (→ AD6; the new
  box→image / aspect-ratio-from-intrinsic model removes most of this surface.)
- **Dev-process:** the **stale-build trap** — two quick saves under `dev:vault` can load an
  *intermediate* build (e.g. a function renamed at the call site but not the definition →
  `ReferenceError`), looking like "rendering broke"; force a clean `location.reload()`. The **CDP
  relay (9222) flaps after a plugin reload** (old socket lingers in TIME_WAIT) — connect directly to
  `CDP_PORT=9223` until it recovers. (See CLAUDE.md → Live debugging.)

---

## 2. Solved bugs — verification round (2026-06-01, via CDP in Obsidian)

Worked off one by one after running the plugin. (Bug 9 was intentionally absent.) Kept here as the
cause+fix record so the same regressions aren't reintroduced.

| # | Symptom | Cause | Fix | Status |
|---|---|---|---|---|
| 1 | AUTO link reveal not shown on first render | `autoGrow` ran while the textarea was `display:none` → height pinned to 0 | OBSOLETE — superseded by the overlay reveal model: no plugin-owned textarea/field; editing is Obsidian's native cursor-reveal of the source, reveal-for-looking is static CSS | SOLVED (n/a) |
| 2 | Rotated reflow box mis-sized | competing async passes re-measured at different widths (the `693`px seen was an export-test artifact) | single render path (reconcile skips widget images, duplicate `ensureBox` removed) + ResizeObserver recompute; no fallback to the transient parent width | SOLVED✓CDP |
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
| 14 | Revealed link editor had a frame | inherited input styling | OBSOLETE — superseded by the overlay reveal model: there is no plugin-owned revealed-link editor; editing is native document text (no frame to override) | SOLVED (n/a) |
| 15 | Image wider than the canvas when no size set | `width: max-content` on `.image-wrapper` | drop it; rely on native `div.image-embed { width: fit-content }` | SOLVED✓CDP |
| 16 | Resize frame offset from the image | `.image-wrapper` padding | zero the padding so `inset:0` hugs the image | SOLVED✓CDP |
| 17 | Standalone classes lost in live preview (regression of 11) | **L9** — the `{…}` braces were passed to the parser, dropping the leading `.class` token | strip the braces in `lineDecorations`; regression test | SOLVED✓CDP |
| 18 | Resized crop left an empty band (caption pushed below) | the box kept `crop.h` tall while content scaled with width | `cropBoxSize` aspect-correct when one dimension is given; unit-tested | SOLVED✓CDP |
| 19 | Inline (mid-text) image rendered native & full-size | `EMBED_LINE` only matched standalone lines → Obsidian drew its own | the **same** widget in an inline mode (`inlineEmbeds`), not a separate widget | SOLVED✓CDP |
| 20 | `lie-center` only centred *on hover* | Obsidian forces `.cm-content > * { margin: 0 !important }` (higher specificity + `!important`) → it beats our `margin:auto`, so centring only took after a reflow | centre via `text-align:center` on a **full-width** (`width:100%`) block embed — no `!important` arms race against Obsidian | SOLVED✓CDP |
| 21 | Scroll jank; image sections render very late (live preview) | the block widget had **no `estimatedHeight`**, so CM6 modelled each off-screen image line as one ~14px text line; the box also grew 0→real after layout | `EmbedWidget.estimatedHeight` + `reserveBox` both derive from **one** pure `estimatedBlockHeight({crop,width,height})` (DRY, unit-tested; exact for crops via `cropBoxSize`); the async loop only *refines* it | SOLVED✓CDP |

Also solved & CDP-verified: **F22/D9 captions** (alt text → Markdown caption, centred, wraps within
the image width; settings toggle, off by default); **R0** (one uniform box for every image; removed
the `display:contents` "normal" special case).

---

## 3. The rework — landed (2026-06-03) + new learnings

The code now implements the **new model** the artifacts describe (native-CSS storage, declarative
box→image sizing, the LP overlay, pure-CSS caption, install/reset snippets, preset-width vars). The
"old model" caveat in `open-items.md` §7 is resolved. CDP-verified in the running app
(Obsidian 1.12.7) on `examples/lie-verify.md`:

- **Declarative geometry holds (AD3/AD6).** normal `300px` → box `300×200`; `rotate(90deg)` of a
  1.5-ratio landscape → box `200×300`, img `150% / 66.67%`, `--lie-auto-aspect: 0.667`; flip → box
  `120×180`. All from the **intrinsic ratio**, applied to the DOM, **no measure-then-resize loop**.
- **Crop is native + clipped.** `width/height` = the cut frame (`250×250`), `overflow:hidden`, img
  `width:100%; height:auto; transform-origin:top left` + `translate()/scale()`.
- **LP overlay + native edit work** (see L11 below).

New hard-won learnings from the rework:

- **L11 — The live-preview adapter must NEVER replace the line; it OVERLAYS (AD5).** *Cause
  (the user's hard rule, validated over a long test session):* the only way to get native
  editable/selectable/copyable source text is to **let Obsidian render its own embed and merely
  suppress it** — a `Decoration.replace` (even of a non-active line) kills the native source, and a
  plugin-owned editable field reintroduces the caret seam. *Fix:* a **block widget** (`side: 1`,
  AFTER the line so the native source reveals ABOVE it and the overlay follows down) draws the
  plugin's own transformed image; CSS suppresses the native image AND the native edit-block-button
  (`.cm-content .internal-embed.image-embed > img, > .image-wrapper, > .edit-block-button`) — the
  markdown `<img>` is a **direct child** (no `.image-wrapper`), the wikilink wraps it; the
  edit-block-button is a `<>` code-2 icon that otherwise **leaks** (Bug 12). The `{…}` block is a
  `Decoration.mark` hidden by `.cm-line:not(.cm-active) .lie-attr-hidden` (F3) and shown on the
  active line (F9). The reveal-for-looking is a display-only `.lie-fake-link` (toggle/default/hover).
  *(CDP-confirmed via screenshots: native image suppressed, no duplicate, reveal toggles, edit
  reveals the `{…}` above the image.)*
- **L11b — Obsidian keeps an image EMBED rendered even on the active line; only the trailing
  `{…}`/alt become editable text** (CDP-verified, both markdown and wikilink). So native editing
  covers the **transform block** (the plugin's data — what matters), not the `![…]`/`![[…]]` link
  itself, which stays a (suppressed) embed. This is Obsidian's behaviour, embraced as required.
- **L12 — `container-type: size` on the box works, but collapses to 0×0 when the box's pane is
  `display:none`.** Reading-view boxes measured 0×0 while the editor pane was the hidden one; in
  the visible pane they size correctly. Not a bug — just a measurement caveat (measure in the
  visible pane).
- **Dev-process — reading view does not render headless.** Obsidian's reading-view renderer is
  visibility-driven (it renders sections as they become visible); a backgrounded/headless window
  (CDP from the container) leaves `.markdown-preview-sizer` empty. Verify the reading-view path in
  a **focused** window, or rely on the shared `applyTransformToImage` (verified via live preview).

## 3a. Post-rework bug-fix round (2026-06-03, CDP+screenshot-verified)

A user test pass found 29 issues in the first rework; fixed and **visually verified** via the new
`scripts/obsidian-screenshot.mjs` (CDP `Page.captureScreenshot`):

- **Reveal/edit model corrected to the true AD5 overlay** (L11) — was briefly mis-built as a
  block-replace + plugin textarea (reverted). Verified: reveal toggles (Bug 1), reveal/edit ABOVE
  the image (Bug 2/9), no native `<>` leak (Bug 12), no duplicate image.
- **Reset no longer whites-out the window** — `classList.add("")` on an empty class token threw in
  the CM update cycle; guarded (Bug 7).
- **Rotate centred** via `translate(-50%,-50%)` prepend (a >100%-wide rotated img left-aligned
  under `margin:auto`) (Bug 6).
- **Snippet "png"** came from `img.png` in a CSS *comment* — strip comments + filter file
  extensions (Bug 13).
- **Captions** below the image, centred, width-limited, Markdown-rendered — pure CSS on a
  shrink-wrapping `.lie-box` host (Bug 27/28).
- **Toolbar** anchored to the image top via `.lie-box` (Bug 4); **fold-then-wrap** (D2
  revised): a measured reflow folds groups to a submenu trigger (Layout→Edit) and only then lets
  `flex-wrap` wrap at the dividers — verified at 700/300/150px (Bug 5).
- **Crop** rebuilt: the FRAME is the fixed output (size = the box, aspect = the presets); the
  handles SCALE the inner image toward the frame centre (Bug 17); the committed result equals the
  framed region (Bug 19, screenshot-verified); the crop overlay is exempt from the dismiss handler
  so it no longer closes on a click/drag-release (Bug 18/24).
- Filter panel gained the shared per-panel **reset** (Bug 22/23); **temperature** removed (Bug 15);
  size "Original"/cleared field no longer collapses the box (Bug 20); resize handle CSS (Bug 16);
  the three demo notes migrated to native syntax (Bug 26).

**Still OPEN (honest):**
- **Bug 25** — rotating/flipping an ALREADY-cropped image via the toolbar drifts out of frame: the
  crop renders with a top-left origin, so a composed rotate/flip doesn't pivot about the frame
  centre. Needs a centre-origin composition (or baking the rotation into the crop params) — a
  focused follow-up, NOT rushed.
- Reading-view render is visibility-driven and doesn't render headless, so captions/float/inline
  there were verified only in **live preview** (shared code) — needs a focused-window pass.

## 4. Open / residual

- **Display-mode residual.** The uniform box computes to `display:block` on a plain page vs
  `inline-block` where an alignment class is present — harmless given the explicit px width, but a
  residual special case worth tidying under AD3. (OPEN, minor.)
- **Reading-view + interactive UI re-verification (focused window).** The reading-view live render,
  captions on a real captioned image, and the interactive panels (crop / filter / size) + the
  native save dialog (F13, not CDP-reachable) await a **focused-window / manual** pass. The pure
  logic each depends on is unit-tested; the wiring/visuals need eyes on a real window. (OPEN,
  verification only.)
- **Crop responsiveness (VERIFY, `open-items.md` §3).** Box-relative `translate%` + `width:100%`
  img should rescale a crop with the column; structurally correct, not yet measured under a
  narrowing column.
