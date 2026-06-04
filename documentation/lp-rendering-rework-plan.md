# LP rendering rework — implementation plan

Status: **IMPLEMENTED** (2026-06-04; planned 2026-06-03). All slices 0–6 landed on `main`, each CDP-verified in the examples vault — see `issues.md` (the resolved float/tall-float entries + L11/L13) and `architecture.md` AD5. One deviation: **Slice 5 (bare-embed fallback) was realized in CSS, not JS** — the native-image suppression is scoped to `.cm-line` embeds, so a block-promoted bare embed shows Obsidian's own native block image (cleaner than imperative fake-link insertion, same goal). Grounds: the float/wrap feasibility probes (memory `lp-float-wrap-feasibility`) and the converged decisions (memory `lp-rendering-rework-decisions`). **Supersedes** the "Option A (reading-view-only float)" direction in `issues.md`.

## Goal
Make live-preview image rendering uniform and correct:
- images render as **inline widgets in their own non-BFC `.cm-line`** (not the current `block:true` overlay);
- `lie-left`/`lie-right` **wrap text multi-line in LP** (float escapes the non-BFC host line into `.cm-content`'s BFC);
- the link source (**fake-link**) gets a **uniform home** in the populated cm-line;
- **native editing preserved** (markdown-first, no `Decoration.replace`);
- **R0** honoured (with the minimal, Obsidian-imposed bare-embed exception).

## Why (one line)
Float in LP is fully broken today; this fixes it and dissolves the fake-link-home problem in the same move. CDP-verified: multi-line wrap, 0 desync, 0 click-steal, image clickable (`z-index:1`), native edit intact.

## Module map (file → change)

### `src/live-preview.ts` — the rendering switch (core)
- Standalone image decoration: change from `Decoration.widget({ block:true, side:1 })` at `d.to` to an **inline** widget rendered IN the embed's own cm-line.
- `.lie-wrapper` becomes an inline-block float participant; ensure the **host `.cm-line` stays non-BFC** (no contain/overflow/flow-root from us — verify CM/Obsidian don't add one).
- `lie-left`/`lie-right`: `float:left/right` on the wrapper → relies on the non-BFC escape into `.cm-content`.
- **fake-link**: now has a home in the populated cm-line — render it there, declarative, per the existing mode classes.
- **Tall-float guard**: if image (rotated) height > threshold AND a float class is present → render **non-floated block** (safe fallback). Driven by the setting; applied so LP and reader match.

### `src/styles-injector.ts` + `styles.css` — float routing & wrapper
- `ALIGN_HOSTS` already targets `.cm-content .lie-wrapper:has(img.lie-left/right)`. **Keep the LP float host** — this REVERSES the uncommitted "Bug-20 drop-LP-host" leaning (LP float is wanted now). Reconcile/revert the uncommitted `styles-injector.ts` change accordingly.
- Add `z-index:1` (+ `position:relative`, already present) on the floated wrapper so the image stays clickable.
- Ensure no rule forces the host `.cm-line` into a BFC.

### Normalization (new) — every image carries `{…}`
- **Lazy** (always on): editor extension / change-listener that appends a `{…}` marker to a bare `![](url)`/`![[…]]` embed once the line is "complete" (cursor leaves the line / on insert). Debounced, single undo step, no update loop.
- **Bulk**: command "Normalize images (note / vault)" + a settings toggle to enable auto-normalize-on-edit.

### Shared edit writer — `isolateHistory` + DRY (new)
- One helper all source-writes funnel through (crop, rotate, flip, filter, resize, class apply, **and** normalization). Dispatches the whole new line in **ONE** transaction via the CM view:
  `editor.cm.dispatch({ changes, annotations: isolateHistory.of("full"), userEvent: "lie.transform" })` — no `selection` (don't move the cursor; UI edits have none).
- Effect: **each plugin edit = exactly one undo step**, never merged with adjacent typing/edits, never split — regardless of how large the `{…}` block is.
- This is the same consolidation as the DRY audit (the `main.ts` panel openers re-implement the location-lookup + write boilerplate → funnel through one writer). Undo-uniformity + DRY in one.
- Caveat: one logical edit must be one transaction — if a command currently writes in two dispatches, bundle them.

### Bare-embed JS fallback (new, scoped)
- For an un-normalized bare embed (block-promoted, no cm-line): imperatively insert the fake-link. STRICTLY isolated from the declarative path; only fires when `{…}` is absent. Transient — normalization erodes it to ~never.

### Settings (new)
- **Tall-float behaviour toggle** (default = safe non-float fallback above ~250px), governing **LP and reader identically**, with explanatory text.
- Normalization-on-edit toggle.

### Docs to update on landing
- `issues.md`: close/redirect "Live-preview float breaks CM6 layout" (Option A) → resolved via inline non-BFC float; record the tall-float cap.
- `architecture.md` AD5: the LP rendering model changes from overlay-block to inline-float; note the fake-link now lives in the (always-populated) cm-line.

## Decisions (settled)
- **Unify**: ALL images render as inline non-BFC widgets. `block:true` survives ONLY as the transient bare-embed fallback (Obsidian-forced). Inline is what makes the hover-reveal work (image + fake-link share the cm-line → `.cm-line:hover`) and the wrap possible — block can do neither.
- **Marker** = `{.lie-img}` (the existing `MARKER_CLASS`, pure JS hook, NO css → invisible). Serializer fix: keep the marker even when the image has no other state (today `transforms.ts:141` only emits it `if (hasState)` → would strip it back to bare → re-promotion).
- **Normalization trigger** = when the cursor enters the embed line (link or attr) → the user has focus and notices it; **switchable off in settings**. Self-terminating (line is no longer bare after `{…}` → can't re-fire); belt-and-suspenders: tag own transactions with a `userEvent` and ignore them.
- **Undo** = each plugin edit (incl. normalization) is exactly one history step via the shared `isolateHistory.of("full")` writer (see module map).
- **Tall-float** = ~250px threshold (CM6 `VP.MaxCoverMargin`); above → non-float block fallback, governing LP **and** reader identically, exposed as a settings toggle (default = safe) with explanatory text.

## Slice sequence (autonomous build order)
Each slice: implement → `npm run build && npm run lint && npm test` green → CDP-verify in the examples vault where rendering is touched → **commit** (one per slice). Dependencies are why this order; a slice may sub-split if it helps, but keep the order.

0. **Cleanup** — revert the superseded/dead working-tree code to HEAD so the rework starts clean: the block-float "Bug-20" hack in `src/styles-injector.ts`, the dangling `.lie-peek` rule + comment edits in `styles.css`, and the i18n `<>`-description removal in `src/i18n/*`. KEEP `documentation/issues.md` and `CLAUDE.md`. (Confirm each via `git diff` before reverting.)
1. **Shared isolateHistory writer + DRY** — funnel all existing edits (crop/rotate/flip/filter/resize/class) through one writer; foundational, no rendering change. Verify undo = one step per edit.
2. **Normalization** — lazy on cursor-enter (+ settings toggle) + a "Normalize images (note/vault)" command, marker `{.lie-img}` via the writer, + the serializer keep-marker fix. → every embed becomes `{…}`.
3. **Unify rendering** — all `{…}` images render as inline non-BFC widgets: fake-link in the cm-line (home + `.cm-line:hover` reveal), `lie-left/right` float-escape wrap (+ `z-index:1`), no desync/contain:paint. Retire `block:true` from the main path. CDP-verify wrap + hover-reveal + no click-steal + native edit.
4. **Tall-float fallback + setting** — >~250px floats render non-float block in LP and reader; settings toggle + explanatory text.
5. **Bare-embed JS fallback** — scoped fake-link insertion for transient un-normalized bare embeds; strictly isolated from the declarative path.
6. **Docs** — update `issues.md` (close float "Option A"; record the rework + tall-float cap) and `architecture.md` AD5 (overlay-block → inline-float; fake-link lives in the cm-line).

## Verification (CDP, per change)
Multi-line wrap on hard-wrapped paragraphs; per-line `CMh==DOMh`; `posAtCoords` on wrap text (no steal); image clickable; fake-link home present for plain (post-normalization); native edit/caret; tall-float fallback engages and LP↔reader match.
