---
name: tiny-image-toolbar-diagnosis
description: "Confirmed — the tiny bare-image toolbar mis-position bug (positionAbove rect.top+8) is real; only bare(paint-contained) needs body-float, attr could overflow"
metadata: 
  node_type: memory
  type: project
  originSessionId: 025352f9-da70-4fb2-b9c2-74c5ad3df12a
---

CDP diagnosis (2026-06-04) of the tiny-image toolbar edge case. Permanent test fixtures live in the examples vault: `examples/images/tiny-24.png` (24×24) and the "## Edge: tiny bare image" section in `Live Image Editor Demo.md` — Case A bare `![](images/tiny-24.png)`, Case B `…{style="width: 24px"}`. DO NOT remove them.

Findings (LP mode, current shipped build):
- **Case A (bare, no `{…}`)**: Obsidian block-promotes the line (no cm-line); plugin draws its `block:true` `.lie-wrapper-block`, a direct `.cm-content` child with **`contain: paint`**. Too short (24px < ~28px bar) → reflow flags it `lie-float` → body-float toolbar.
- **Case B (`{…}`)**: stays a `.cm-line`; plugin draws inline `.lie-wrapper-standalone`, **`contain: none`**. Also flagged `lie-float` (height check only) → same body-float path.
- **The bug is real**: floating toolbar (`ImageToolbar.positionAbove`, toolbar.ts:243) sets `top = rect.top + 8`. For a 24px image (top 501, bottom 525) the ~38px bar lands at top 509 → sits ON the image and overhangs 22px BELOW its bottom (547), NOT above. Shown on `document.body` so NOT clipped, but mis-positioned. Identical for A and B.
- **Containment comparison (empirically confirmed)**: a probe marker overflowing 30px ABOVE the box is CLIPPED on A (contain:paint → elementFromPoint = `.cm-line`, not painted) but VISIBLE on B (contain:none → elementFromPoint = the marker). → Only the bare case genuinely needs the body-float escape; the `{…}` case could be solved by letting the in-chrome bar overflow visibly above (no body-float). Current `fitsInsideHeight` logic (toolbar.ts:195) lumps both into the buggy body-float because it only checks height, not paint-containment.

Fix — **APPLIED (commit `c192dcf`, 2026-06-04)**: `positionAbove` now places the bar truly ABOVE the image (`rect.top - toolbar.offsetHeight - gap`, measured on the DOM) with a BELOW fallback near the viewport top, and the left edge clamped (`toolbar.ts:239-257`). The float-out trigger now fires by COVERAGE (`COVER_LIMIT = 0.6` of the image height, `reflowToolbar:194-197`), not by physical fit. The recommended paint-containment SPLIT was **NOT** taken — the shared JS body-float path is kept for ALL too-small wrappers (the bare/paint-contained case genuinely needs the DOM move to `document.body`; `contain:paint` makes a CSS-only escape impossible), so LP and reading view deliberately keep two positioning mechanisms (this retired the old "toolbar unification" deferred idea). See [[lp-float-wrap-feasibility]] for the related z-index:1 float-escape work.

## CSS-only vs JS decision (2026-06-04) — VERDICT: JS must stay (one case IS paint-contained)

Three permanent fixtures now in "## Edge: tiny toolbar cases" (Demo.md): A bare, B `{…}`, C inline `.lie-inline` — all tiny-24.png. CDP per case:
- A bare → BLOCK widget (`.cm-content` direct child), **contain:paint**.
- B `{…}` → STANDALONE inline widget in `.cm-line`, **contain:none**.
- C inline icon → INLINE widget in `.cm-line`, **contain:none**.

Above-overflow clip test (inject a marker at `position:absolute; bottom:100%` = a CSS toolbar above the image, then elementFromPoint):
- A: **CLIPPED** (not visible, hit = `.cm-line`) — `contain:paint` clips it.
- B & C: **VISIBLE** (not clipped) — CSS above-overflow works.

Crux test — can A's toolbar escape via `position:fixed` as a wrapper child (CSS-only, no JS)? **No**: the fixed child is BOTH clipped AND mis-placed (landed at top=972 not viewport-relative) because `contain:paint` makes the wrapper the *containing block* for fixed descendants. So CSS-only-as-child is impossible for the bare case; the toolbar must be DOM-moved out to `document.body` = exactly the JS body-float.

**VERDICT: JA, genau ein Fall (A bare) ist paint-contained → JS body-float MUST stay for the bare case; CSS-only is not feasible for all.** For B & C, CSS-only (`position:absolute; bottom:100%`) would work. Recommended split: keep the JS body-float ONLY for paint-contained (bare/block) wrappers and FIX `positionAbove` (place above: `rect.top - h - gap`); let B & C use pure-CSS above-overflow (drop their `lie-float` body-float). The `lie-float`/`fitsInsideHeight` gate should test paint-containment, not just height.
