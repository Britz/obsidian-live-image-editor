---
name: lp-float-wrap-feasibility
description: "LP text-wrapping floats (lie-left/right): the non-BFC inline-float-in-own-line approach WORKS (multi-line wrap, no desync); earlier approaches + caveats, CDP-proven"
metadata: 
  node_type: memory
  type: project
  originSessionId: 025352f9-da70-4fb2-b9c2-74c5ad3df12a
---

## BEST APPROACH (2026-06-03): float as inline widget in its OWN cm-line, host line deliberately NOT a BFC — WORKS

**SHIPPED (2026-06-04)** — this approach is now implemented on `main` (the LP rendering rework; see [[lp-rendering-rework-decisions]] for the per-slice outcome). Re-verified end-to-end in the examples vault: 0 desync, 0 click-steal, multi-line wrap, image clickable via `z-index:1`, native edit intact; the tall-float (>~250px) edge is handled by the tall-float cap (stack as block). The bare case is handled by leaving Obsidian's native block embed visible (suppression scoped to `.cm-line`).

This is the winning approach. Render a lie-left/right image (always carries `{…}` → Obsidian does NOT block-promote, so the cm-line exists) as an INLINE widget IN its own embed cm-line, floated (`float:left/right` — the existing ALIGN_HOSTS injector already supplies this for `.cm-content .lie-wrapper:has(img.lie-left/right)`), with the host cm-line left as a NON-BFC.

Topology that makes it work (CDP-verified): `.cm-line` is NOT a BFC (display:block, contain:none, overflow:visible, position:relative), but `.cm-content` IS a BFC (it's a flex item — parent `.cm-contentContainer` is display:flex). So the float ESCAPES the host cm-line and is contained by `.cm-content`, where it shortens the line boxes of the FOLLOWING sibling cm-lines (multi-line wrap) while leaving their block positions unchanged.

CDP results on "Layout and text wrapping.md" (float-left 180px, hard-wrapped Lorem paragraph):
- Float escapes: host cm-line collapsed to DOMh=24 (text height) while floatBox h=180. ✓
- **Multi-line wrap**: 3+ following hard-wrapped cm-lines wrap beside the image (textX right of float edge). ✓ — this is what the flow-root approach could NOT do.
- **ZERO height desync**: every line CMtop==DOMtop and CMh==DOMh exactly (float counts to no line's height, so CM's text-height-per-line stack == real render). ✓✓ — the decisive win over the block-widget approach (which desynced by the full image height).
- **No click-steal**: posAtCoords on wrap text → correct line, 0/6 stolen. ✓
- **Native editing intact**: caret sits inside the embed line (real 79-char doc text), Obsidian reveals source tokens (`.cm-formatting`) on the active line, wrap-text edits real & reversible — no Decoration.replace. ✓

One CAVEAT remaining (Caveat 1 below is now FIXED):
1. **z-order / pointer — FIXED & verified (2026-06-03).** Baseline: floats paint BELOW in-flow content, so overlapping transparent cm-line boxes intercepted pointer events over the image (elementFromPoint(imgCenter) = `.cm-line`). Fix: add `position:relative; z-index:1` on `.lie-wrapper-floatinline` (the base `.lie-wrapper` is already position:relative, so only `z-index:1` is the new bit). CDP after fix: elementFromPoint over img upper/center/lower = `IMG.lie-img` (hover-toolbar & click-to-select now work); NO collateral (wrap text right of the float still = `.cm-line`; the raised box covers only the image-sized float, not the text column); NO new click-steal (posAtCoords on wrap text 0/4 stolen); and it does NOT hide the revealed source/fake-link — when the embed line is active the source tokens render on the line-top row (y=425) ABOVE the float top (y=447), all `coveredByFloat=false`, hittable, `fakeLinkVisible=inline`. z-index:1 is minimal and sufficient (lifts above sibling cm-lines within `.cm-content`'s stacking context); the in-image toolbar is a wrapper child so it rides along; body-level overlays (floating toolbar, panels) are separate higher stacking contexts, unaffected.
2. **Tall-float virtualization glitch (still open)**: CM's above-viewport render margin is ~250px. A float TALLER than that → scrolling the anchor line out of the render window derenders the float widget while wrap lines stay visible → text reflows full-width (wrap visually breaks; NO desync). Normal images (≤~250px tall) always safe (wrap span ≤ image height ≤ margin). Verified with a 1400px float: anchor derendered ~1100px above, float gone, lines still measured consistently.

Net: feasible for real multi-line wrap on hard-wrapped paragraphs, markdown-first, no desync/click-steal, image clickable (z-index:1) — only the tall-float (>~250px) virtualization glitch remains. Supersedes "Option A (reading-view-only)" if tall floats are acceptable/handled.

---
### Earlier approaches (superseded by the above)

Feasibility probe (2026-06-03, throwaway prototype, reverted) of text-wrapping around floated images in Obsidian Live Preview (CM6).

**Root cause of the existing float bug (proven via CDP height-map probe):** a floated BLOCK widget is out of flow → contributes ~0 in-flow height, so following `.cm-line`s render *beside/over* it; but CM6's per-line height oracle still reserves the image height on the source line and stacks following lines *below* it. Measured desync: CM placed the wrap line at top=3065 while it actually rendered at 2850 (~215px = image height). Consequence: `cm.posAtCoords` on visibly-editable wrap text (`elementFromPoint` = contentEditable `.cm-line`) mapped to the WRONG line (off by one) → **click-steal**; the same desync drives scroll jumps + late/virtualized render.

**The "inline-float in the next cm-line" hypothesis — tested:** inject the image as an inline widget at the start of the following text line, with `display:flow-root` on that `.cm-line`.
- SINGLE-source-line (soft-wrapped, no hard newlines) paragraph: WORKS. flow-root contains the 180px float; CM measured the tall line correctly (DOMh=240=CMh=240); 8 text rows wrapped beside, 2 below; **0 click-steal**.
- HARD-wrapped paragraph (each newline = separate `.cm-line`, the project's own demo-doc style): FAILS. flow-root only contains the float in its host line; the remaining source lines render full-width and the float OVERLAPS them (image paints over hidden text). Reintroduces the desync/overlap.

**Verdict: feasible-with-constraints.** A CSS float can only wrap content in its own containing block; CM6 makes every source line a separate block, so multi-line wrap needs the float to span siblings = the broken path. Caveats if pursued: only single-line paragraphs wrap; breaks R0 uniformity (needs fallback to block widget when no following paragraph / at doc end / before heading); leaves a ~24px blank "source line N" artifact above the paragraph (native cursor/edit on it still works). Reading view is unaffected (no CM) — float there is fine. Relates to issues.md "Live-preview float breaks CM6 layout" (Option A = reading-view-only float).

## Follow-up (2026-06-03): standalone image as INLINE-block widget instead of block:true — REJECTED

Tested (throwaway, reverted) rendering our overlay as an inline widget INSIDE the cm-line (`Decoration.widget` at d.to, side:1, no `block:true`; wrapper inline-block) instead of `block:true` at d.to. Goal was (a) escape block-widget pitfalls (CM height desync, app.css `.cm-content > [contenteditable=false]{contain:paint}` clipping) and (b) keep the cm-line populated so the fake-link has a uniform home even for a plain `![](url)` with no `{…}`.

**Hard blocker — Obsidian block-promotes a bare embed line, independent of us.** CDP on "Live Image Editor Demo.md":
- PLAIN Bild 1 `![](images/sample-landscape.png)` (no `{…}`): Obsidian renders the embed as its OWN direct `.cm-content` child `<DIV.internal-embed media-embed image>` (h=6, native img suppressed) — **there is NO `.cm-line`**. Our inline widget at d.to falls inside Obsidian's replaced line range and is **DROPPED**: `ourImg=0`, `fakeLink=0`, and Bild 1 renders **NOTHING** (blank 6px line). Catastrophic — the inline path loses the image on exactly the hard case.
- ATTR 1a `![](…){.lie-img …}` (with `{…}`): Obsidian does NOT promote (the trailing `{…}` keeps it a text line). Here the inline approach works well — cm-line populated (DOMh=266=CMh=266 MEASURE OK, no desync), `fakeLink=1`, our inline-block img is a direct child of `.cm-line` so `contain:none` (goal a achieved), click on image → correct line (no steal), host stays contentEditable (native edit intact).

**Conclusion:** an inline-rendered widget does NOT override Obsidian's native block-promotion of a pure `![](url)` line — they collide and our widget is swallowed. So the inline-block idea is viable ONLY for `{…}`-carrying embeds and FAILS the plain-embed case (breaks R0, and gives the fake-link no home on the very case that lacks one today). The blocker is Obsidian's promotion, which is independent of how we render; the only levers to stop it (Decoration.replace, or editing source to add `{…}`) violate markdown-first. Keep the current `block:true` overlay for standalone images. The plain-embed fake-link-home problem needs a different solution (e.g. a block-level reveal), not inline rendering.
