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

## 3. Open / residual

- **Display-mode residual.** The uniform box computes to `display:block` on a plain page vs
  `inline-block` where an alignment class is present — harmless given the explicit px width, but a
  residual special case worth tidying under AD3. (OPEN, minor.)
- **Re-verification pending.** A few behaviour items (captions, the native save dialog) await
  CDP/manual re-verification after an Obsidian reload. (OPEN, verification only.)
- **Design rebuild caveat.** The biggest "issue" is not a bug: the code is still the *old* model
  while the artifacts describe the new one — see `open-items.md` §7. New bugs from that rebuild land
  here.
