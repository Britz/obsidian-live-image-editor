# Open Items & Registry — Live Image Editor

> The single backlog + registry for the plugin, in two parts:
>
> 1. **OPEN — checklist at the top.** Everything still to do, as `- [ ]` items grouped by kind
>    (open decisions, verifications, deferred ideas, DRY/KISS, known open bugs). Tick them off as
>    they land. Items marked **(verify)** could not be confirmed from code/commits and need a check.
> 2. **SOLVED / DONE — registry at the bottom.** Everything already resolved, kept on purpose with
>    its **cause + fix** so the same mistake is not made twice. The hard-won lessons keep their
>    **L1–L13** numbers and the bugs keep their **Bug N** numbers — other docs (`architecture.md`,
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

*(Bug 33 — the bare-key WRITE PATH — is **SOLVED**; the real root cause was a basename collision in
the source resolver, NOT the hypothesized "serialize emits only width". See **Resolved by the
write-path matrix + Bug 33 fix** under SOLVED / DONE.)*
*(Bug 32 — the crop editor not migrated to the 3-layer model (cluster) — is **SOLVED** (incl. the
true in-place conversion that closed the DEFER "Crop-in-place" item, and the host-wide auto-persist);
see **Resolved by the crop-editor in-place rework** under SOLVED / DONE. The drag haptics +
pinch-sensitivity feel remain the one MANUAL check.)*
- [ ] **Auto-persist on anchor-disconnect can hit the wrong occurrence of a DUPLICATED image.** Any
      panel (crop/filter/size) that auto-persists when its anchor leaves the DOM (scrolled out of the
      CM6 viewport mid-edit) re-resolves the source line from a now-DETACHED `activeImage`, so
      `locateImage` can't use the line-accurate `posAtDOM` path and falls back to the basename scan
      (`findImageInSource` → first occurrence — the Bug-33 failure mode). So editing the *2nd* embed of
      a repeated file and then scrolling it out of view can write to the *1st*. Pre-existing for
      filter/size (they already committed on disconnect); newly reachable for crop (the old crop
      *cancelled* on disconnect). *Fix (a focused follow-up):* capture the resolved `ImageLocation` at
      panel-open and reuse it on commit instead of re-resolving from the detached image; add a row to
      the `verify-write-path.mjs` matrix. Narrow trigger (duplicated image + scroll-out mid-edit).
*(Bugs 29–31 — the LP reveal / source-rendering cluster — are **SOLVED**; see **Resolved by the
LP reveal cluster fix** under SOLVED / DONE.)*

*(Bug 25 — rotate/flip drifting an already-cropped image — is **SOLVED** by the crop-geometry rework;
see **Resolved by the crop-geometry & representation rework** under SOLVED / DONE.)*

*(The LP-rendering-rework cluster — live-preview float, the tall-float cap, the reading-view sizing
cluster, the inline-icon/tiny toolbar position, and the `<>` reveal toggle — has landed; see
**Resolved by the LP rendering rework + follow-ups** under SOLVED / DONE.)*

### Deferred design / elegance (DEFER)

- [x] **Crop-in-place** vs the mirroring overlay — **SOLVED** (folded into the Bug 32 rework; see
      **Resolved by the crop-editor in-place rework** under SOLVED / DONE). The clone overlay is gone:
      the editor edits the LIVE 3-layer DOM, lifting `overflow:hidden` (frame/area) and the host
      `contain:paint` (`!important`, beaten with `!important`) for the crop duration so the image
      overflows the cut with the outside dimmed and the inside full — no `document.body` clone, no
      reflow (the footprint stays reserved). The interactive pan/zoom/rotate feel is the one MANUAL
      check that remains.
- [ ] Smaller chrome unification: resize handle, anchored sub-menu, filter-panel docking — all anchor
      to the uniform box.
- [x] **Portable render runtime + `{…}` format — FINAL model — SOLVED.** The bare-key format, the
      3-layer DOM, the Obsidian-free render core and the standalone runtime bundle have all landed;
      see **Resolved by the portable-runtime + format-migration rework** under SOLVED / DONE. The
      `width`/`align` migration to bare keys and the `lie-runtime.js` bundle (the two remaining
      strands) closed this pass; the 3-layer DOM + crop tokens + export landed in the prior
      crop-geometry rework. *(Still open, separate: the crop-in-place editor — see DEFER above.)*

### Under-specified details (SPEC)

- [x] Exact **crop serialization** tokens (how the cut-frame aspect + placement sit in the attr block).
      **SOLVED** by the crop-geometry rework: placement = `transform="<2D-affine>"` on the inner
      `<img>`; cut-frame aspect = `aspect-ratio=` on the outer, stored only when the crop shape ≠
      original (else derived — AD6); the crop never stores a fixed px `height`. See the SOLVED entry.
- [ ] Shared **sub-menu host** component API (D6 / F14).
- [ ] **Link-form conversion** edge cases (F5 / F6).

### Housekeeping (CHORE)

- [x] **Test Plan** (`documentation/test-plan.md`): **spec stands; suite implemented.** The §2 pure
      units (incl. §2.8 per-op persistence — the Bug 33 guard) are written and green (121 passing),
      and the §3 AD1 write-path matrix is a runnable read-source-back CDP check
      (`scripts/verify-write-path.mjs`, 14/14 incl. the duplicate-image case). The Bug 32 and Bug
      29–31 regressions are `it.todo` placeholders (`tests/regressions.test.ts`) pending their own
      diagnose-first passes; the focused/manual checks (§6: native save dialog, reading-view window,
      drag haptics) remain manual by design.

### DRY/KISS audit — fresh against HEAD (2026-06-04)

Re-grounded on the current `src/` after the **LP rendering rework** (Slice 1's shared
`source-writer.ts` writer, the A/B'/C uniform-render follow-up, and the `.lie-img`-marker removal)
on top of the earlier box rename (`lie-rotate-box`→`lie-image-area`/`lie-box` swap) and the
small/inline toolbar reflow. Supersedes the stale 2026-06-03 audit (its dissolved points are in
**Solved / Done** below). Every box here is a **pure, functionality-preserving refactor** (each
says why behaviour is preserved); effort S/M/L. Behaviour-affecting items are split out at the end
and **not** ticked as pure refactors. Per `methodology.md`, each was checked first against a
missing requirement/architecture point.

DRY — one source of a piece of logic:

- [ ] **`main.ts` panel openers re-implement the location LOOKUP.** `customSize`
      (`src/main.ts:632-635`), `crop` (`:670-673`), `toggleFilters` (`:702-705`), `addClass`
      (`:742-745`) and `exportImage` (`:778-780`) each repeat
      `getActiveViewOfType → editor → findImageInSource → parseAltText` and `return` silently on
      failure — the exact lookup `resolveLocation()` (`:512-526`) already encapsulates *with* its two
      user-facing Notices. *(The WRITE half is already DRY — every edit funnels through
      `writeTransform` → `writeToSource` → the shared `writeSource` in `source-writer.ts`; only this
      lookup half is still duplicated.)* Funnel the openers through the lookup too. **Why
      behaviour-preserving:** same lookup, same early-out; the only observable change is the *added*
      Notice on failure — to keep the openers silent, reuse the lookup without the Notice (extract the
      lookup half). *Effort M.*
- [ ] **`parseLocationTransform` in `image-resolver.ts` is dead.** `src/image-resolver.ts:79-81` has
      **zero callers** in `src/` or `tests/` (verified by grep) and is just
      `parseAltText(location.params)`. Delete it. **Why behaviour-preserving:** an unreferenced export
      — removal changes no runtime path. *Effort S.* *(The sibling `updateImageSource` named in the old
      audit is already gone — removed with Slice 1 when the shared `source-writer` writer landed; see
      Solved.)*
- [ ] **"filter ≠ default" predicate iterated 3×.** `transforms.ts isDefaultFilter` (`:256-258`) and
      `filterToCss`'s per-key guard (`:249`) both test `val !== FILTER_DEFAULTS[key]`, and
      `filter-panel.ts currentFilter` (`:119-127`) re-implements the same "collect non-default keys"
      loop against its own `getFilterDefaults()`. Add one `nonDefaultFilter(f): FilterData` in
      `transforms.ts` and have `currentFilter` call it (it already builds exactly that object).
      **Why behaviour-preserving:** identical comparison and result object, computed in one place.
      *Effort S.* *(Down from the old "4×": `filterToVars` is gone.)*
- [ ] **`.lie-image-area` queried as a magic string instead of `BOX_CLASS`.** `main.ts:198` and
      `:318` hard-code the literal `"lie-image-area"` that `renderer.ts` already exports as
      `BOX_CLASS` (`src/renderer.ts:10`); `crop-editor.ts` and `live-preview.ts` correctly use the
      export. Import and use `BOX_CLASS` in `main.ts`. **Why behaviour-preserving:** the literal and
      the constant are the same string. *Effort S.* *(The related `lie-image-area-rotate` mismatch is
      already fixed — see Solved.)*

KISS — fewer moving parts / one shared component:

- [ ] **`crop-editor.ts` teardown duplicated.** `close()` (`src/crop-editor.ts:131-138`) and
      `confirm()` (`:310-325`) both run the same teardown (remove `lie-cropping`, remove + null the
      overlay, detach the two `pointermove`/`pointerup` listeners). Extract one private `teardown()`
      both call (confirm runs its `toCropResult` + `onConfirm` first, then tears down; close then
      closes the controls). **Why behaviour-preserving:** same statements in the same order, only
      hoisted. *Effort S.*
- [ ] **Icon-button build repeated 3× in `anchored-submenu.ts buildHeader`** (`:205-246`): reset
      (`:219-225`) / cancel (`:228-233`) / confirm (`:235-240`) each do `createElement("button")` +
      classes + `aria-label` + `title` + `setIcon` + click. One `iconBtn(icon, labelKey, onClick,
      extraClass)` helper. **Why behaviour-preserving:** produces the identical DOM and the same
      listeners. *Effort S.*
- [ ] **Text/preset-button build repeated across the three panels.** `filter-panel.ts buildPresets`
      (`src/filter-panel.ts:139-159`, loop `:150-156`), `size-submenu.ts` quick presets
      (`src/size-submenu.ts:60-73`, loop `:62-73`) and `crop-editor.ts openControls`
      (`src/crop-editor.ts:155-179`, loop `:158-163`) each build a labelled `<button>` with a class +
      `textContent` + click. One small `textBtn(label, cls, onClick)` helper (co-located, e.g. in
      `toolbar.ts` or a tiny `ui.ts`). **Why behaviour-preserving:** same element/text/handler;
      classes stay per-panel via the arg. *Effort S.* *(The old "slider row duplicated (temperature +
      normal)" is DISSOLVED — there is now a single `buildSlider` called in a loop and no separate
      temperature row in the panel; see Solved.)*
- [ ] **`styles.css` repeats the button base 5×.** `.lie-crop-preset-btn` (`styles.css:439`),
      `.lie-filter-preset-btn` (`:479`), `.lie-class-dropdown-item` (`:518`), `.lie-submenu-icon-btn`
      (`:555`) and `.lie-size-choice` (`:574`) each redeclare `border-radius`, `cursor: pointer`, a
      background and `:hover { background: var(--background-modifier-hover) }`. Add one base `.lie-btn`
      (the shared rules) and let each keep only its specifics (two set
      `background:var(--background-primary)`, three `transparent`). **Why behaviour-preserving:** the
      computed styles are unchanged if the markup also gets the base class (a docs-only proposal —
      implementing it touches `.ts` + CSS together; mark the CSS+class pair as one change).
      *Effort M.*

Behaviour-near — verify carefully (L8 / L10 / Bug-2 territory):

- [ ] **Embed-matching regexes are spread across six modules** with overlapping but
      *deliberately different* capture groups: `image-resolver.ts:18-19` (`WIKI_EMBED`/`MD_EMBED`,
      global, path + block), `link-format.ts:19-20` (`WIKI`/`MD`, caption + path + block),
      `live-preview-logic.ts:5,15` (`EMBED_LINE`/`INLINE_EMBED`, whole-line anchored), `caption-logic.ts:17,24`
      (caption only), `live-preview.ts:48,55` (highlight split + file resolve), `main.ts:264`
      (native-size fold). Share only the **embed-token sub-pattern** (the
      `!\[…\]\(…\)|!\[\[…\]\]` alternation and the `(\{[^}]*\})?` block) as named fragments; do **not**
      force one regex. **Why behaviour-preserving (IF done as pure factoring):** the composed regexes
      must match byte-for-byte — risky, so treat as L-effort and gate on the full embed-parsing test
      suite (`tests/link-format`, `tests/live-preview`, `tests/caption`, `tests/transforms`). *Effort L.*

> **Rejected / not pursued (do NOT chase):**
> - The floating toolbar and the in-image toolbar are **not** a duplicate — both build via
>   `buildToolbarElement` (`toolbar.ts:115`); only host + positioning differ (intended, D1/D1.1).
> - The crop overlay's mirroring image vs the rendered box is tracked as a **design** item
>   (Deferred → "Crop-in-place"), not a pure refactor.
> - `RevealMode = "auto" | "always"` (`live-preview.ts:29`) is **not** a retired mode cycle — the two
>   values are derived from the global default-state setting (`alwaysShowLink`); the `<>` dismiss
>   is a SEPARATE per-line override (a `lie-dismissed` line decoration, auto-clearing in auto mode),
>   not a third reveal mode. `cycleRevealMode` is gone. Leave it.

> **Behaviour-affecting — NOT a pure refactor, flagged for a decision (do NOT bundle into the pure pass):**
> - **`temperatureAdjust` (`transforms.ts:308-321`) is dead in `src/`** — exported and unit-tested
>   (`tests/transforms.test.ts`) but with **no production caller** (the filter panel builds no
>   temperature row; its comments at `filter-panel.ts:216,261` still describe one). It backs F11 (the
>   virtual temperature control), so removing it *drops a documented capability* — that is a
>   requirements decision (reopen F11), not a refactor. Either wire the temperature slider back into
>   `filter-panel.ts` (restores F11) or retire F11 + the function + its test. **Behaviour-risk —
>   excluded from the pure-refactor list.**

### `*-logic.ts` split — KISS analysis (keep, unless a test shim is added)

The user asked whether each pure `*-logic.ts` unit should merge back into its framework-coupled
counterpart. **Verified import graph (grep):**

| logic unit | imported by (production) | imported by (tests) |
|---|---|---|
| `live-preview-logic.ts` | `live-preview.ts` only | `tests/live-preview.test.ts` |
| `renderer-logic.ts` | `renderer.ts`, **`live-preview.ts`, `export.ts`** | `tests/renderer-logic.test.ts` |
| `crop-editor-logic.ts` | `crop-editor.ts` only | `tests/crop-editor-logic.test.ts` |
| `caption-logic.ts` | `caption.ts` (re-export) | `tests/caption.test.ts` |
| `anchored-submenu-logic.ts` | `anchored-submenu.ts` only | `tests/anchored-submenu-logic.test.ts` |

So the "imported only by its counterpart + the tests" claim holds for four of the five —
**`renderer-logic.ts` is the exception**: it is consumed by three production modules
(`renderer.ts`, `live-preview.ts`, `export.ts`), so it is a genuine shared unit and merging it
anywhere would *create* a new dependency, not remove one. It should stay split regardless.

For the other four, merging would be a real simplicity win (one file per concern, no
counterpart/`-logic` pair). **But the tradeoff is the load-bearing one (AD7/T8/L6):** there is **no
vitest/vite config** in the repo and **no obsidian/`@codemirror/*` mock** — every test imports only
framework-free modules (the five `*-logic.ts`, plus `transforms.ts` / `link-format.ts`). The
counterparts all import `obsidian` and/or `@codemirror/*`, which **do not resolve under vitest**.
Merging would force a test to import a module that pulls those in, breaking the suite **unless a
vitest config with an obsidian + CM mock/alias is added first** (a new build surface and a fragile
parallel to the real APIs — exactly the cost AD7 pays the `-logic` split to avoid).

- [ ] **Recommendation: KEEP the split as-is.** The pure logic is testable without Obsidian/CM,
      which is the whole point of AD7/T8/L6; the win from merging is small (file count) and the cost
      (an obsidian/CM test shim) is the thing the split exists to avoid. **Behaviour note:** a merge
      would change **test imports only**, never plugin runtime behaviour — so it is *allowed* as a
      refactor, but it is **not recommended** here. If a shim is ever wanted for other reasons, the
      four single-consumer units (not `renderer-logic.ts`) could then fold in. *Effort (if pursued): M
      — the shim, not the moves.*

---

## SOLVED / DONE

> Resolved work, kept as the cause+fix record. The **L1–L13** lessons and **Bug N** numbers are
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
      - **LP overlay + native edit** — see L11/L11b; reveal-for-looking is a display-only fake link
        keyed by static CSS (auto/always modes + the `<>` dismiss), with a global default-state
        setting.
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

### Resolved by the LP rendering rework + follow-ups (2026-06-04)

The rework folded into the canonical docs (`architecture.md` AD5/AB9/AB16/AB20,
`implementation-plan.md` §2.4/§3.3, `test-plan.md` §3/§4). Memories `lp-float-wrap-feasibility`
and `lp-rendering-rework-decisions` carry the CDP proof and the per-slice outcome. *(The standalone
`lp-rendering-rework-plan.md` has been removed — its content lives in those artifacts now.)*

- [x] **Live-preview float (`lie-left`/`lie-right`) breaks CM6 layout (cluster) — RESOLVED.** The old
      block-widget overlay's float fought CM6's virtualized line/height measurement → wrap rendered
      late / only sometimes, content jumped on scroll, the toolbar/menu didn't appear, clicks on
      wrapped text were stolen (off-by-one caret). **This SUPERSEDED the old "Option A"
      (reading-view-only float).** *Fix:* render a `{…}` image as an **INLINE** widget in the embed's
      OWN non-BFC `.cm-line`; a `float:left/right` then ESCAPES into `.cm-content`'s BFC and shortens
      the following sibling cm-lines → real multi-line wrap, with **zero height desync** (the float
      counts to no line's height), no `contain:paint` clip, and the image kept clickable via
      `z-index:1`. The missing float↔text gap ("Bug 20") dissolved with it: the inline wrapper is NOT
      a `.cm-content` direct child, so `.cm-content > * { margin:0 !important }` never touches it.
      *No normalization dependency* (A/B'/C): a floated image already carries `{…}` (its alignment
      class keeps the line a text line → inline widget + float-escape); a BARE image renders via our
      OWN `block:true` widget with the native image suppressed **uniformly** (cca476e), so Obsidian's
      block-promotion no longer matters and the auto-normalization was removed (4053f95).
      CDP-verified: multi-line wrap on hard-wrapped paragraphs, 0 desync over 35 lines, 0 click-steal,
      image clickable, native edit intact. (→ AD5.)
- [x] **Tall float (>~250px) derenders on scroll in LP — CAPPED.** A float taller than CM6's ~250px
      above-viewport render margin (`VP.MaxCoverMargin`, an inlined const in `@codemirror/view`)
      derenders when its anchor line scrolls out of the render window → the wrap dissolves (harmless:
      **no desync**, top-exit direction only). *Fix:* the shared renderer marks such a float `.lie-tall`
      (via `isTallFloat`/`TALL_FLOAT_THRESHOLD_PX` in `renderer-logic.ts`) and, in safe mode
      (**default**; the `tallFloatSafe` setting → `body.lie-safe-tall-float`), it STACKS as a
      non-floated block — in **both** views (`.lie-wrapper` in LP, `.image-embed` in reading view) for
      cross-view consistency. Permissive mode floats it regardless, accepting the LP-only glitch.
- [x] **Reading-view sizing of transformed images (cluster) — RESOLVED.** (a) A transformed box
      (e.g. a rotated image sized to its natural rotated AABB) overflowed the column because the box
      `max-width:100%` was circular against the shrink-wrapping inline-block `.internal-embed`. *Fix:*
      `max-width:100%` on the embed shrink-wrap rule caps the host against its BLOCK containing block
      (the reading-view column), so the box caps too — CDP: a rotate-90 image now caps at the 521px
      column (was 800px), matching LP. (b) Not reproducible — the per-image vertical overhead is the
      native ~6px (CDP: 6px embed padding, 6px inter-image gap); the old "huge gap" was intervening
      headings/text between image groups. (c) A floated image + its wrap text on consecutive source
      lines render as `[floated .image-embed][<br>][text]` in ONE paragraph, and that first `<br>`
      pushed the wrap text a full line below the image top. *Fix:* hide the `<br>` that is the
      next-element-sibling of a floated embed (reading view, float-only) → the text wraps from the
      image top — CDP: was +23px, now 0px. LP unaffected (0 desync, float-escape intact; R0 — reader
      now matches LP).
- [x] **Inline-icon / tiny-image toolbar mis-positioned — RESOLVED (commit `c192dcf`).** The floating
      (body) toolbar for an image too small to hold the in-chrome bar sat ON / below the image because
      `positionAbove` used `top = rect.top + 8`. *Fix:* place the bar truly ABOVE the image
      (`top = rect.top − toolbar.offsetHeight − gap`, measured after it is on the DOM), with a BELOW
      fallback (`rect.bottom + gap`) when there is no room above so it never goes off-screen; the left
      edge is clamped against the right viewport edge (`toolbar.ts:239-257`). Also, the float-out
      trigger now fires by **coverage** (`COVER_LIMIT = 0.6` of the image height,
      `reflowToolbar:194-197`), not by whether the bar still physically fits — so a short-wide image
      escapes early while a narrow-but-tall one keeps its in-chrome bar. The shared body-float path is
      unchanged: the bare/paint-contained case still needs the DOM move to `document.body`
      (`contain:paint` makes a CSS-only escape impossible), so the **two positioning mechanisms (LP
      JS body-float + reading-view CSS) are deliberate, not a duplicate** — this also retired the old
      "Toolbar unification" deferred idea. CDP-verified across the A bare / B `{…}` / C inline-icon
      fixtures at sizes 24/100/240/782px. *(This also subsumes the earlier "toolbar missing on ≤311px
      images" note — the reflow now keeps the wrapped bar in-chrome while it fits, else floats it.)*
- [x] **`<>` reveal toggle — RESOLVED into a transient "dismiss" (landed at HEAD).** The rework collapsed
      the reveal to **two natural modes** — `auto` (reveal on cm-line hover or the active line) and
      `always` (reveal everywhere) — driven by the global *Always show the link source* setting
      (`alwaysShowLink`). The toolbar's `<>` icon is now a transient **dismiss toggle** that
      **dismisses** this image's source (fake link + `{…}`): a `lie-dismissed` LINE decoration that
      overrides the natural reveal. In **auto** mode it AUTO-CLEARS once the line is neither hovered
      nor the active line (so the next hover/edit reveals it again); in **always** mode it persists
      until toggled again or reload. There is **no** third "hidden" mode and **no** `cycleRevealMode`
      (the per-line reveal mode is gone). Code: `live-preview.ts` (`RevealMode = "auto"|"always"`,
      `DISMISSED_LINE`, `toggleReveal`/`setHover` effects); CSS: `lie-rev-auto|always` +
      `.lie-dismissed` (`styles.css:262-271`). (→ AD5/AB16.)

### Resolved by the crop-geometry & representation rework (2026-06-04)

One change to the crop GEOMETRY & REPRESENTATION model resolved three coupled entries at once
(Bug 25, the crop serialization SPEC, and the structural half of crop-in-place). The model split
ORIENTATION from PLACEMENT and moved to the 3-layer DOM. Unit-tested (108 passing) + CDP-verified in
the example vault (the new-format probe note + back-compat on the legacy Demo images).

- [x] **Bug 25 — rotate/flip drifts an already-cropped image — SOLVED✓CDP.** *Cause:* the crop
      rendered with a **top-left origin** and the toolbar's rotate/flip were composed INTO the same
      `<img>` transform string (`setRotation` merged a `rotate()`), so a rotate pivoted about the
      image corner and swung the cut out of frame. *Fix (3-layer, AD3):* ORIENTATION (`rotate`/`flip`)
      is now its own model field, routed to a new **inner-frame** layer (`.lie-frame`) and composed
      **about the frame centre** (a structural pivot); the crop PLACEMENT (`transform=`) stays on the
      `<img>`, untouched. So re-orienting a crop reorients the frame and the `<img>` placement is
      byte-identical — no drift, no coordinate recompute. CDP: a 4/3 crop and the same crop + `rotate=90`
      have the **identical** `<img>` transform (`translate(-20%,-10%) scale(1.8)`), the rotate sits on
      the frame, and the footprint swaps 240×180 → 180×240. Export composes the same way (content →
      orient): the cut renders at original resolution (667×500) then the orientation rotates it
      (500×667). (Code: `transforms.ts` `rotate`/`flipH`/`flipV` fields + bare `rotate=`/`flip=`;
      `renderer.ts` outer/`.lie-frame`/`<img>` + `applyOrientation`; `export.ts` `renderContent` +
      `orient`. Regression: `tests/transforms.test.ts` "rotating a CROP never touches the placement".)
- [x] **Crop serialization (SPEC) — SOLVED.** The crop now serializes as the bare keys
      `transform="<2D-affine placement>"` (on the `<img>`) + `aspect-ratio=<cut shape>` (on the outer,
      stored **only** when the cut shape ≠ the original ratio, AD6) + `width=` — and **never** a fixed
      px `height` (that distorts). `toCropResult` emits `{ transform, width, aspectRatio? }`; the
      renderer drives the crop footprint from the cut shape + angle via `--lie-auto-aspect` (so it
      swaps on a rotate), not from the natural image ratio. (Code: `crop-editor-logic.ts`;
      `renderer.ts` `cropAspect`/`shapeFrame`. Regression: `tests/crop-editor-logic.test.ts`.)
- [x] **3-layer DOM + bare-key format (partial migration) — landed.** The plugin now builds the
      uniform **outer `.lie-image-area` → inner-frame `.lie-frame` → `<img>`** structure for every
      image (AD3), upgrading a reused legacy 2-layer DOM. The parser reads **both** the new bare keys
      (`rotate`/`flip`/`transform`/`filter`/`aspect-ratio`) **and** the legacy `style="transform: …"`
      (back-compat: an orientation-only legacy transform decomposes into the fields; a crop placement
      stays whole). The writer emits the new format. *Deferred (a later slice — out of this pass):*
      `width`/`height` still rode `style=` and `align` was still a `.lie-left/right/center` class — both
      since migrated to bare keys (see the portable-runtime rework below).
- [x] **Crop-in-place editor — DONE** (see **Resolved by the crop-editor in-place rework** below).

### Resolved by the crop-editor in-place rework (2026-06-04)

Bug 32 (the editor cluster) + the DEFER "Crop-in-place" + a host-wide **auto-persist** change. The
crop editor was re-derived from AD3 to edit the LIVE 3-layer DOM (no clone), mirroring the render
core's geometry so **preview == committed by construction**. Unit-tested (128 passing) + a 20/20
read-DOM-back CDP check (`scripts/verify-crop.mjs`, Live Preview **and** reading view, no console
errors). The drag haptics + pinch sensitivity feel are the one MANUAL check (a focused-window test).

- [x] **Bug 32 — crop editor migrated to the live 3-layer model — SOLVED✓CDP.** *Cause:* the editor
      ran on the OLD pre-rework assumptions — a `position:fixed` **clone** on `document.body` with a
      **top-left** transform-origin and absolute-px translate — while the renderer had moved to the
      3-layer DOM with a **centre** origin and `%`-translate placement. So (A) rotate pivoted the
      image corner and the framed content swung out of view (B/C the rotate "looked dead" / the
      overlay "didn't rotate" were the same top-left artifact); (D) the white handles sat on a clone
      frame, not the inner image; (E) no edge handles were ever emitted; (F) the native-handle hide
      was scoped to `.lie-wrapper` only, so it leaked in reading view; (G) a width edit desynced the
      crop; (H) the gestures were undamped. *Fix (from AD3):* the editor now edits the live
      `.lie-image-area → .lie-frame → <img>` in place and drives the SAME `toCropResult` placement the
      renderer commits (centre origin, `translate(%)` / `rotate` / per-axis `scale`), so the live
      preview IS the committed render — A/B/C closed. Handles attach to a `.lie-crop-handles` box that
      tracks the inner image (4 corner aspect-locked + 4 edge single-axis + a rotate knob); the cut
      window + footprint box stay fixed during the session (presets reshape only the cut, gestures
      move/scale/rotate the image) — D/E. True **in-place**: `.lie-cropping` lifts `overflow:hidden`
      on the frame/area and the host `contain:paint` (app.css `!important`, beaten with `!important`)
      for the crop duration; a dim ghost copy shows the croppable surround (outside dimmed, inside
      full) with no `document.body` clone and no reflow — closing the DEFER "Crop-in-place". The
      native handle is hidden host-agnostically (`.lie-cropping .image-resize-corner`) in BOTH views —
      F. The `width` write paths (toolbar custom-size + the LP resize handle `rewriteWidth`) are
      field-additive and the placement is column-invariant, so a width edit PRESERVES `transform=` /
      `aspect-ratio=` — G. Wheel + trackpad-pinch zoom are damped by one named constant each (pan
      stays 1:1) — H. (Code: `crop-editor.ts` rewritten; `crop-editor-logic.ts` `toCropResult`
      per-axis scale + the pure `parsePlacement` round-trip; `styles.css` crop chrome; `main.ts`
      `crop()` persist-or-clear; `anchored-submenu.ts`/`filter-panel.ts` auto-persist. Regressions:
      `tests/crop-editor-logic.test.ts` (round-trip == no drift, edge-handle `scale(sx,sy)`),
      `tests/regressions.test.ts` (width-edit keeps the crop, both paths). Structural CDP:
      `scripts/verify-crop.mjs` 20/20. Fixture: `examples/Crop editor (Bug 32).md`.) *Post-review
      hardening:* assign `this.cropEditor` BEFORE `open()` so a synchronous self-close (image not in
      the 3-layer DOM) can't restore a dead ref and jam the trigger; skip `.lie-cropping` images in
      `reconcileFromSource` so a layout-change re-render can't clobber a live reading-view session;
      `unrotate` now mirrors the pan delta on a flipped frame too (`S·R(-θ)`, not just `R(-θ)`).
- [x] **Crop teardown restores ALL transient overrides on EVERY exit — VERIFIED✓CDP.** *Concern:* the
      old editor had two teardown paths (confirm vs cancel — the DRY audit's "double teardown"); if
      only one restored the lifted host `contain`, a confirmed crop would leave `contain:none` stuck
      and permanently break the LP block-widget paint-containment. *Verified:* the auto-persist rework
      collapsed teardown into a SINGLE `exitCropMode` run from the one `onClose` that
      `AnchoredSubmenu.close()` fires on every exit (commit / Esc / click-away / dismiss / unload), so
      there is no second path. `scripts/verify-crop-teardown.mjs` proves it structurally per exit path
      on a real `.lie-wrapper-block` host (pre-crop `contain:paint`): lifted to `none` during crop,
      and after EVERY exit the host `contain` reads back `paint` (the no-op path proves the
      paint→none→paint round-trip on the same un-rebuilt element), no `.lie-cropping`/inline `contain`
      leak, no orphan `.lie-crop-*` nodes, the image renders, no console error.
- [x] **Auto-persist for the shared sub-menu host (crop / filter / size) — DONE.** The host no longer
      has accept / cancel buttons (F14/D6/AD8 re-grounded): while a panel is open the working state is
      a LIVE DOM preview only (no source write); LEAVING it (close / Esc / click-away / dismiss /
      context loss) persists ONCE through the shared `isolateHistory.of("full")` writer = **one undo
      step** for the whole editing session. The only in-session revert is the per-panel **Reset**
      (Ctrl/Cmd-Z afterwards undoes the session). Esc now LEAVES-and-persists (it no longer discards);
      plugin unload is the one silent teardown (`close(false)`). (Code: `anchored-submenu.ts`
      `close(persist)` + no X/check in `buildHeader`; `filter-panel.ts`, `size`/`main.ts` openers
      drop `onCancel`; `crop-editor.ts` persists-or-clears on leave.)
- [x] **Crop pan must grab the WHOLE image (inside AND outside the cut frame) — SOLVED✓CDP.**
      *Cause (a pointer-events/hit-area bug, not optics):* in-place crop overflows the full image past
      the cut window; that overflow is the dim ghost (`.lie-crop-ghost-img`). `.lie-crop-ghost` is
      `pointer-events:none` and the img INHERITED it, so the whole region OUTSIDE the cut frame was a
      non-target — the pan listener (on `.lie-image-area`) only ever fired from INSIDE the cut (where
      the bright live `.lie-frame` at z:2 catches and bubbles to the area); outside there was no
      catching layer (ghost = none, chrome z:6 = none), so the drag fell through to the document and no
      pan started. *Fix (structural, at the hit layer):* make the ghost IMG the pan hit-surface —
      `pointer-events:auto` on `.lie-crop-ghost-img` (the frame BOX stays `none`, click-through). The
      grip is now the whole visible image: INSIDE the bright `.lie-frame` (z:2) catches, OUTSIDE the dim
      ghost img (z:1) catches — both bubble to the area's pan listener; the dimming is the img's own
      opacity (no separate blocking overlay), and the chrome/handles (z:6, box `none`; only the
      handle/rotate children `auto`) still win their own hits, so pan never collides with resize/rotate.
      *Guard:* `scripts/verify-crop-pan.mjs` — a read-DOM-back CDP check that proves via real
      `elementFromPoint` hit-testing that the pan layer is hit-testable (frame box + chrome are `none`),
      a drag STARTED OUTSIDE the cut frame translates the live img, an inside drag does too, and a
      handle still wins its own hit. (Code: `styles.css` `.lie-crop-ghost-img { pointer-events:auto }`.)

### Resolved by the LP reveal cluster fix (2026-06-04)

The Bug 29–31 cluster (LP reveal / source-rendering), diagnose-first via CDP. Plus the F8/F20 doc
alignment to the **auto** default.

- [x] **Bug 29 — reveal toggle showed an eye icon — SOLVED✓CDP.** *Cause:* `makeRevealButton`
      rendered `eye`/`eye-off`. *Fix:* it now renders the Lucide **`code`** glyph (`<>`) in both
      states; the dismissed state shows faint (`.is-off`) + a flipped tooltip/aria, so the
      affordance stays honest without an eye. CDP: the toolbar reveal SVG is `lucide-code`.
- [x] **Bug 30 — `<>` dismiss must hide the WHOLE raw embed — already covered; re-verified.**
      *Diagnosis:* the suspected cause (`.lie-dismissed` not covering `.lie-fake-link`) was **already
      fixed** by the earlier reveal-toggle rework — `styles.css` has
      `.lie-dismissed .lie-fake-link, .lie-dismissed .lie-attr { display:none !important }`, covering
      BOTH the fake `![](…)` link and the `{…}` (and `!important` beats the non-important
      `.cm-active`/hover reveal rules). CDP confirmed: on dismiss, `.lie-fake-link` AND `.lie-attr` both
      compute to `display:none`, and the active line carries no leaked native source tokens (Obsidian
      keeps `![…]` an embed, L11b — only `{…}`/alt become editable text, which the dismiss hides). The
      dismiss-hide itself needed no CSS/markup change; the diagnose-first pass additionally **extracted
      the dismiss/auto-clear state machine to a pure `reduceReveal`** (`live-preview-logic`) — making the
      subtlest part executable-testable — and **hardened the auto-clear** so a fresh `<>` dismiss always
      takes effect in its OWN transaction (resetting only on a LATER leave / cursor-move). That closes a
      latent edge where the `:focus-within` / keyboard reveal path could reach the `<>` control with no
      prior `mouseenter` (so `hoveredLine` is unset), instantly clearing the dismiss; it also aligns the
      auto-clear with its stated "clear on leave, not within a visit" intent. Pinned by
      `tests/regressions.test.ts` (the `reduceReveal` state-machine units) + `scripts/verify-reveal.mjs`
      (the live-DOM `display:none` check, always mode).
- [x] **Bug 31 — the `{…}` lost its syntax highlighting — SOLVED✓CDP.** *Cause:* in LP the `{…}`
      block was one plain `lie-attr lie-rev-<mode>` mark with no CM tokens (the inline-widget/bare-key
      migration dropped the highlight — CDP: 0 cm-token children, plain text colour). *Fix:* the build
      now marks the whole `{…}` with a SINGLE `Decoration.mark` carrying `lie-attr lie-rev-<mode>` PLUS
      `URL_CLASS` (`cm-string cm-url`, from `live-preview-logic`), so the revealed block is highlighted
      like a `(url)` string while the reveal/dismiss visibility rules still key on `.lie-attr`.
      **Deliberately NOT `cm-formatting`/`URL_BRACE_CLASS`:** a direct cm-line child carrying
      `cm-formatting` would match `.cm-line:has(> .cm-formatting)` — the heuristic that detects
      Obsidian's OWN native source reveal — and wrongly hide the fake link (so the `{…}` braces are
      coloured as plain url-string, not brace-formatting; regression guarded by
      `scripts/verify-reveal.mjs`). CDP: the `{…}` now carries `cm-url` tokens + a themed colour.
- [x] **F8 / F20 default = auto (docs).** The requirement said the reveal defaults to *shown*; the
      code (and the model) default `alwaysShowLink` OFF = **auto** (reveal on hover / active line).
      requirements.md F8 + F20 aligned; the per-line `<>` dismiss is unchanged.

### Resolved by the write-path matrix + Bug 33 fix (2026-06-04)

- [x] **Bug 33 — toolbar/menu edits wrote to the WRONG image; almost nothing appeared to persist —
      SOLVED✓CDP.** *Symptom:* the resize handle's `width` persisted, but presets / rotate / flip /
      filter / align / crop seemed to do nothing. *Diagnosis (the hypothesis was wrong — diagnose-first
      paid off):* `serializeTransform` and the whole `modifyTransform → serialize → writeSource` path
      were **fine** (CDP: driving any op on a SINGLE image persisted every key). The real root was the
      **source resolver**: `findImageInSource` matched by **basename and returned the FIRST
      occurrence**, so any op on a non-first embed of a **repeated file** wrote to the first image's
      line — and the demo reuses `sample-*.png` many times, so most ops "did nothing" (a far-away image
      changed instead). The resize handle escaped this because it resolves the line from the rendered
      image's **DOM position** (`view.posAtDOM(wrapper)`), not basename. *Fix (at the root):* a new
      `locateImage` resolves the active image's line from its DOM position via CM6 `posAtDOM` (the same
      line-accurate path the handle uses), with the basename scan only as a fallback (reading view /
      no live editor); a new `findImageInLine` matches the embed on that exact line. Every toolbar/menu
      resolution (`resolveLocation` + the crop / size / filter / add-class / export openers) now routes
      through it. *Guards:* the §2.8 per-op persistence units (pure — every op serializes its key) and
      the runnable §3 AD1 write-path matrix `scripts/verify-write-path.mjs` (reads the real source
      back; includes the duplicate-image case that pins the basename collision). CDP-verified: rotating
      the SECOND of two same-file embeds writes the second line, the first stays untouched.

### Resolved by the portable-runtime + format-migration rework (2026-06-04)

Closed the two remaining strands of the transform rework. Unit-tested (113 passing) + CDP-verified
(plugin render parity old↔new in the example vault; the standalone runtime hydrating a plain
document in a real Chromium engine, no Obsidian). The `{…}` format is now the full bare-key set and
the portable runtime is built.

- [x] **width / align → bare keys (T2.3) — SOLVED✓CDP.** `align` is now a model FIELD serialized as
      `align=left|right|center` (a real HTML attr → faithful float/centre fallback); a px `width` is
      `width=N` (faithful), never with `height=` (distortion goes via `style=`). The parser still
      reads the legacy `.lie-left/right/center` classes and `style="width:…"` (back-compat — old
      notes render unchanged); the renderer re-derives the `lie-left/right/center` MARKER class on the
      img from the field so the `:has(img.lie-…)` float/centre rules still match. Size PRESETS are
      **baked** to a literal `width=N` px at click time (faithful, not setting-reactive — the user's
      chosen trade-off). CDP: new bare-key and legacy class/style forms render identically (left→
      float:left, center→text-align:center, both at the same width). (Code: `transforms.ts` `Align`
      + `align`; `render-core.ts` marker re-derive; `main.ts` `applyAlignment`/`applyPreset`;
      `size-submenu.ts` baked presets.)
- [x] **Obsidian-free render core extracted (AB7a) — SOLVED.** `renderer.ts` → `src/render-core.ts`,
      a framework-free module (imports only `transforms` + `renderer-logic`; NO obsidian/CM): the
      3-layer builder `buildLayers(img, transform)` (the plugin renderer and the runtime are two
      callers of it — DRY/R0), the identification (`CLAIM_SELECTOR` + `readTransform`), and the
      structural **`RENDER_CSS`** string. The LAYER CSS moved OUT of `styles.css` into `RENDER_CSS`,
      injected at runtime by BOTH the plugin (`styles-injector`) and the runtime — ONE source, so the
      render is identical (R0). `styles.css` keeps only the Obsidian embed integration + chrome.
- [x] **Standalone runtime bundle — SOLVED✓CDP.** `src/runtime.ts` → a SECOND esbuild entry →
      `lie-runtime.js` (framework-free IIFE, render CSS inlined → a single `<script>` include). On
      `DOMContentLoaded` (+ a `MutationObserver` for late content) it selects claimed imgs
      (`[rotate],[flip],[transform],[aspect-ratio],.lie` + the `data-`-prefixed Pandoc variants) and
      calls `buildLayers`, injecting `RENDER_CSS` + a runtime alignment rule (float/centre the outer,
      the flow participant on a foreign page). The runtime esbuild entry has NO `obsidian` external,
      so a stray framework import fails the build (verified: the bundle pulls zero obsidian/CM).
      Identification rule (verified in a real browser engine via an isolated iframe): a distinctive
      key OR `.lie` claims; `align`/`width`/`class` alone do NOT (faithful native fallback). Fidelity
      tiers (T3/F25) hold: with the runtime injectable, full fidelity; without it, `align`/`width`
      stay faithful and `rotate`/`flip`/`transform` degrade to the original image. `runtime-smoke.html`
      is the manual/CI browser fixture. *(Limitation, documented + out of scope: kramdown/Jekyll never
      attach the bare-brace `{…}` to the DOM → unsupported there, the plain original shows.)*
- [x] **T3 (portable rendering) / F25 (never emit plugin-only Markdown) — fulfilled.** One bare-key
      format, three consumers (no-JS fallback, the runtime, the toolbar writer); the runtime-only
      keys degrade to the original image, the native-faithful keys survive everywhere.

### Resolved decisions (formerly DECIDE / FOLD)

- [x] **Reveal/edit model — overlay + CSS reveal + native edit (landed at HEAD).** Supersedes the
      earlier "native path CLOSED → self-built field" conclusion. The LP adapter **does not replace**
      the line (AD5): Obsidian renders its own (CSS-suppressed) native embed and provides the
      cursor-reveal; the plugin overlays its own image. Reveal-for-looking (F8) is a display-only fake
      raw link + the `{…}`, with **two natural modes** — `auto` (reveal on cm-line hover or the active
      line) and `always` (reveal everywhere) — from the global default-state setting `alwaysShowLink`
      (AB19/F20), plus a **`<>` toggle that transiently DISMISSES** this image's source
      (`lie-dismissed`, not persisted per image; auto-clears in auto mode). There is no third "hidden"
      reveal mode and no `cycleRevealMode` cycling (code: `src/live-preview.ts`). Editing (F9) is
      Obsidian's native cursor-reveal of the source as real document text (works standalone + inline).
      `{…}` (F3) is hidden by CSS when rendered, shown on the active line. *(Fully declarative in CSS —
      the fake link yields to the native source via `.cm-line:has(> .cm-formatting)`; the dismiss
      refinement is recorded under "Resolved by the LP rendering rework + follow-ups" above.)*

- [x] **Temperature — virtual-control LOGIC kept; the SLIDER is currently absent (F11, re-verified
      2026-06-03).** `temperatureAdjust` still lives in `src/transforms.ts:307` (nudges
      hue/saturate/brightness; a virtual control, not a native white-point shift) and is unit-tested.
      **But at HEAD `src/filter-panel.ts` builds NO temperature row** — `buildSliders` iterates only
      the `SLIDERS` array (no temperature entry), so `temperatureAdjust` has no production caller. The
      panel comments still describe a temperature slider that isn't there. → reopened as a
      **behaviour-affecting** item in the 2026-06-03 DRY/KISS audit (wire it back to restore F11, or
      retire F11 + the dead function + its test). *(Bug 15 "temperature removed" was a transient
      removal in the post-rework round; the slider has not returned.)*

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
      magic-string mismatch is resolved (still worth a single `visibleBox()`/`BOX_CLASS` helper — see
      the 2026-06-03 DRY list).

### Dissolved by the rework — old 2026-06-02 DRY/KISS audit points (verified gone at HEAD)

These were carried as open in the stale audit; the rework removed the duplication/symbol they
named, so they are recorded here rather than re-listed. Verified by grep at HEAD.

- [x] **`export.ts canvasFilter` re-listing filter functions/units/defaults.** DISSOLVED — there is
      no `canvasFilter`; `export.ts renderTransformedImage` sets `ctx.filter = transform.filter`
      **verbatim** (`src/export.ts:60,82,98`), so the native filter string is the single source. No
      duplicate filter table in export.
- [x] **`export.ts` rotation branch recomputing the rotated bounding box.** DISSOLVED — already DRY:
      export **calls** `rotatedAabb(nw, nh, deg)` from `renderer-logic.ts` (`src/export.ts:79`); the
      old `rotatedBox` symbol no longer exists.
- [x] **"filter ≠ default" iterated *4×* incl. `filterToVars`.** REDUCED, not gone — `filterToVars`
      and the whole `--lie-*` layer were removed, dropping it to **2** sites (`isDefaultFilter` /
      `filterToCss` guard) plus `filter-panel.ts currentFilter`. Carried forward as a smaller DRY item
      in the 2026-06-03 audit.
- [x] **Filter-panel slider row duplicated (temperature + normal).** DISSOLVED — the panel now has a
      single `buildSlider` driven by the `SLIDERS` array in a loop (`src/filter-panel.ts:162-189`) and
      **no separate temperature row** (the temperature control is currently absent — see the
      Temperature entry above). Nothing to merge.
- [x] **`caption.ts` rAF + `setTimeout` polling AND a `ResizeObserver` for the box width.** DISSOLVED
      — the rework's pure-CSS caption (`width:0; min-width:100%` inside `.lie-has-caption`) removed all
      JS width-sync; `caption.ts` / `caption-logic.ts` contain no `ResizeObserver`/`rAF`/`setTimeout`
      (verified). (→ AB7, the [0.3.0] rework milestone.)
- [x] **`addClass` "4th ad-hoc popup" to be merged with the group popup + anchored sub-menu.** Not
      pursued as a *pure* refactor: `addClass`'s dropdown (`main.ts:741-766`), the toolbar
      `openGroupPopup` (`toolbar.ts:53-89`) and the modal `AnchoredSubmenu` are **three intentionally
      different interaction patterns** (run-and-close dropdown vs run-and-close palette vs
      commit/cancel modal). Unifying them is a **design** change (ties to D6/F14), not behaviour-
      preserving — moved to the Deferred design list, not the pure-refactor checklist.

### Hard-won lessons (L1–L13) — must never be re-broken

These were tagged `[LEARNED]` / `T-Ln`. Each is a *bug class* + the rule that prevents it; the
architecture encodes most in its decisions (`AD…`).

- **L1 — An un-replaced image line re-fires Obsidian's native embed (now WANTED).** *Observation
  (still true):* an un-replaced line makes Obsidian render its own native embed and leave the trailing
  `{…}` as visible text (CDP-verified). *Superseded conclusion:* the old "always replace the whole
  line" fix is gone. The native embed is now **embraced** (it loads the image and gives Obsidian's own
  cursor-reveal of the source); the plugin draws its OWN transformed image as the R0 widget
  and **suppresses** the native image with **uniform** static CSS (hides Obsidian's `> img` and
  `> .image-wrapper` in *every* embed, never the plugin's `.lie-wrapper`); the `{…}` is real document
  text hidden by CSS while rendered, shown when the line is active. (→ AD5.)
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
- **L11 — The live-preview adapter must NEVER replace the line; it renders ALONGSIDE the native embed
  (AD5).** *Cause (the user's hard rule, validated over a long test session):* the only way to get
  native editable/selectable/copyable source text is to let Obsidian render its own embed and merely
  suppress it — a `Decoration.replace` (even of a non-active line) kills the native source, and a
  plugin-owned editable field reintroduces the caret seam. *Fix (the LP rendering rework):* an
  **INLINE widget** (`side: 1`, in the embed's OWN non-BFC `.cm-line`) draws the plugin's own
  transformed image; CSS suppresses the native image **UNIFORMLY in every embed**
  (`.cm-content .internal-embed.image-embed > img, > .image-wrapper` — unscoped, cca476e), and the
  native edit-block-button is hidden unconditionally (the `<>` icon otherwise leaks, Bug 12). The
  `{…}` block is a `Decoration.mark` and a display-only `.lie-fake-link` carries the reveal-for-looking;
  both are shown by static CSS on cm-line hover / always-mode and hidden while editing (`.cm-active`,
  when the native source shows so the link is not doubled). *(Earlier this was a `block:true` widget
  BELOW the line; the rework moved it inline so `lie-left/right` floats escape the non-BFC line and wrap
  text. `block:true` now survives as the renderer for a BARE embed — a block-promoted line has no
  cm-line, so an inline widget would be swallowed; the block widget lands as its own `.cm-content` child
  next to the (image-suppressed) native embed. CDP-confirmed.)*
- **L11b — Obsidian keeps an image EMBED rendered even on the active line; only the trailing
  `{…}`/alt become editable text** (CDP-verified, markdown + wikilink). So native editing covers the
  transform block (the plugin's data — what matters), not the `![…]`/`![[…]]` link itself, which stays
  a (suppressed) embed. Obsidian's behaviour, embraced as required.
- **L12 — `container-type: size` on the box works, but collapses to 0×0 when the box's pane is
  `display:none`.** Reading-view boxes measured 0×0 while the editor pane was the hidden one; in the
  visible pane they size correctly. Not a bug — a measurement caveat (measure in the visible pane).
- **L13 — Bare embeds need NO `{…}` (the old normalization dependency is GONE — superseded by A/B'/C).**
  *Original cause (still true):* Obsidian BLOCK-PROMOTES a bare `![](…)` standalone line into a
  `.cm-content`-direct `.internal-embed` with NO `.cm-line`, which would SWALLOW an *inline* widget.
  *Original fix (now removed):* an auto-normalizer appended `{.lie-img}` to keep the line inline.
  *Current resolution:* render a bare embed with a **`block:true` widget** instead — it lands as its
  own `.cm-content` child (not in the line), so block-promotion is irrelevant; and the native image is
  suppressed UNIFORMLY (cca476e). The auto-normalization + the `autoNormalizeImages` setting were
  REMOVED (4053f95 — which also eliminated an undo loop), and the `.lie-img` marker dropped (aff1847;
  the parser still SKIPS it for old notes). So `{…}` is now written ONLY by a real plugin action, and
  no embed needs a marker or normalization to render. (→ AD5; memory `lp-rendering-rework-decisions`.)
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
