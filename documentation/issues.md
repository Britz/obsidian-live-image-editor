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

- [ ] **Bug 25 — rotate/flip drifts an already-cropped image out of frame.** Rotating/flipping an
      already-cropped image via the toolbar drifts it out of frame: the crop renders with a top-left
      origin, so a composed rotate/flip doesn't pivot about the frame centre. Needs centre-origin
      composition (or baking the rotation into the crop params) — a focused follow-up, not rushed.
- [x] **Live-preview float (`lie-left`/`lie-right`) breaks CM6 layout (cluster) — RESOLVED by the LP
      rendering rework.** The block-widget overlay's float fought CM6's virtualized line/height
      measurement → wrap rendered late / only sometimes, content jumped on scroll, the toolbar/menu
      didn't appear, and clicks on wrapped text were stolen (off-by-one caret). **This SUPERSEDES the
      old "Option A" (reading-view-only float).** *Fix (the rework):* render every image as an INLINE
      widget in the embed's OWN non-BFC `.cm-line`; a `float:left/right` then ESCAPES into
      `.cm-content`'s BFC and shortens the line boxes of the following sibling cm-lines → real
      multi-line wrap, with **zero height desync** (the float counts to no line's height), no
      `contain:paint` clip, and the image kept clickable via `z-index:1`. The missing float↔text gap
      ("Bug 20") dissolved with it: the inline wrapper is NOT a `.cm-content` direct child, so
      `.cm-content > * { margin:0 !important }` never touches it — no out-specifying / `!important`
      needed (the uncommitted Bug-20 hack was reverted). CDP-verified: multi-line wrap on hard-wrapped
      paragraphs, 0 desync over 35 lines, 0 click-steal, image clickable, native edit intact.
      *No normalization dependency* (corrected after A/B'/C): a floated image already carries `{…}`
      (its `lie-left`/`lie-right` class keeps the line a text line → inline widget + float-escape); a
      BARE image renders via our OWN `block:true` widget with the native image suppressed uniformly
      (cca476e), so Obsidian's block-promotion no longer matters and the auto-normalization was removed
      (4053f95). (→ AD5; memories `lp-float-wrap-feasibility` / `lp-rendering-rework-decisions`; plan
      `lp-rendering-rework-plan.md`.)
- [x] **Tall float (>~250px) derenders on scroll in LP — CAPPED.** A float taller than CM6's ~250px
      above-viewport render margin (`VP.MaxCoverMargin`, an inlined const in `@codemirror/view`)
      derenders when its anchor line scrolls out of the render window → the wrap dissolves (harmless:
      **no desync**, top-exit direction only). *Fix:* the shared renderer marks such a float `.lie-tall`
      and, in safe mode (**default**; the `tallFloatSafe` setting → `body.lie-safe-tall-float`), it
      STACKS as a non-floated block — in **both** views for cross-view consistency. Permissive mode
      floats it regardless, accepting the LP-only glitch.
- [ ] **Reading-view sizing of transformed images (cluster, can't CDP-test).** (a) Demo img 2–11
      overflow the page width — the box `max-width:100%` is circular against the inline-block
      `.internal-embed`, so a transformed box (width = natural rotated size) isn't column-capped.
      (b) Vertical gap between reading-view images is far larger than the native 6px (inline-block
      line-height / aspect-ratio reserve). (c) Floated wrap text starts ~1.5–2 lines below the image
      top (should align to the image top; ~½ line in LP). Reading view does not render headless →
      fix by reasoning + manual verify.
- [ ] **Inline-icon toolbar mis-positioned.** The floating toolbar for an inline icon sits on/below
      the icon (`positionAbove` = `rect.top + 8`); it should sit above the icon.
- [ ] **`<>` reveal toggle — semantics to revisit.** The LP rendering rework gave "auto" mode a
      cm-line **hover** reveal (the image and its source now share the line), and `<>` (hidden)
      suppresses that hover reveal — so the toggle is no longer a strict no-op in auto. Still worth
      rethinking the `<>` semantics (e.g. a per-image "always show this one" toggle) for clarity.

*(Fixed this session — toolbar missing on ≤311px images: the reflow now keeps the wrapped bar
in-chrome while it fits the image height, else shows the same toolbar floating on the body.)*

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

### DRY/KISS audit — fresh against HEAD (2026-06-03)

Re-grounded on the current `src/` after the big rework (commits `15bdac9` pure-CSS reveal + box
rename `lie-rotate-box`→`lie-image-area`/`lie-box` swap, `23b60e9` small/inline toolbar reflow).
Supersedes the stale 2026-06-02 audit (its dissolved points moved to **Solved / Done** below).
Every box here is a **pure, functionality-preserving refactor** (each says why behaviour is
preserved); effort S/M/L. Behaviour-affecting items are split out at the end and **not** ticked
as pure refactors. Per `methodology.md`, each was checked first against a missing
requirement/architecture point.

DRY — one source of a piece of logic:

- [ ] **`main.ts` panel openers re-implement the location boilerplate.** `customSize`
      (`src/main.ts:626-631`), `crop` (`:664-669`), `toggleFilters` (`:696-699`), `addClass`
      (`:735-739`) and `exportImage` (`:771-776`) each repeat
      `getActiveViewOfType → editor → findImageInSource → parseAltText` and `return` silently on
      failure — the exact thing `resolveLocation()` (`:503-517`) already encapsulates *with* its two
      user-facing Notices. Funnel them through `resolveLocation()` (returning `{ editor, location }`)
      and parse once. **Why behaviour-preserving:** same lookup, same early-out; the only observable
      change is the *added* Notice on failure — to avoid even that, keep the openers silent by reusing
      the lookup without the Notice (extract the lookup half). *Effort M.*
- [ ] **`updateImageSource` / `parseLocationTransform` in `image-resolver.ts` are dead AND duplicate
      live code.** `src/image-resolver.ts:79-93` (`updateImageSource`) and `:95-97`
      (`parseLocationTransform`) have **zero callers** in `src/` or `tests/` (verified by grep);
      `updateImageSource` is a byte-for-byte copy of the `replaceRange` in `main.ts writeTransform`
      (`:552-562`), and `parseLocationTransform` is just `parseAltText(location.params)`. Delete both.
      **Why behaviour-preserving:** unreferenced exports — removal changes no runtime path. *Effort S.*
- [ ] **"filter ≠ default" predicate iterated twice.** `transforms.ts isDefaultFilter` (`:255-257`)
      and `filterToCss`'s per-key guard (`:246-252`) both test `val !== FILTER_DEFAULTS[key]`, and
      `filter-panel.ts currentFilter` (`:119-127`) re-implements the same "collect non-default keys"
      loop against its own `getFilterDefaults()`. Add one `nonDefaultFilter(f): FilterData` in
      `transforms.ts` and have `currentFilter` call it (it already builds exactly that object).
      **Why behaviour-preserving:** identical comparison and result object, computed in one place.
      *Effort S.* *(Down from the old "4×": `filterToVars` is gone.)*
- [ ] **`.lie-image-area` queried as a magic string instead of `BOX_CLASS`.** `main.ts:188` and
      `:309` hard-code the literal `"lie-image-area"` that `renderer.ts` already exports as
      `BOX_CLASS` (`src/renderer.ts:10`); `crop-editor.ts` and `live-preview.ts` correctly use the
      export. Import and use `BOX_CLASS` in `main.ts`. **Why behaviour-preserving:** the literal and
      the constant are the same string. *Effort S.* *(The related `lie-image-area-rotate` mismatch is
      already fixed — see Solved.)*

KISS — fewer moving parts / one shared component:

- [ ] **`crop-editor.ts` teardown duplicated.** `close()` (`src/crop-editor.ts:131-138`) and
      `confirm()` (`:319-324`) both run the same four steps (remove `lie-cropping`, remove + null the
      overlay, detach the two `pointermove`/`pointerup` listeners). Extract one private `teardown()`
      both call (confirm then fires `onConfirm`, close then closes the controls). **Why
      behaviour-preserving:** same statements in the same order, only hoisted. *Effort S.*
- [ ] **Icon-button build repeated 3× in `anchored-submenu.ts buildHeader`** (`src/anchored-submenu.ts:218-244`):
      reset / cancel / confirm each do `createElement("button")` + classes + `aria-label` + `title` +
      `setIcon` + click. One `iconBtn(icon, labelKey, onClick, extraClass)` helper. **Why
      behaviour-preserving:** produces the identical DOM and the same listeners. *Effort S.*
- [ ] **Text/preset-button build repeated across the three panels.** `filter-panel.ts buildPresets`
      (`src/filter-panel.ts:150-156`), `size-submenu.ts` quick presets (`src/size-submenu.ts:63-72`)
      and `crop-editor.ts openControls` (`src/crop-editor.ts:159-163`) each build a labelled
      `<button>` with a class + `textContent` + click. One small `textBtn(label, cls, onClick)`
      helper (co-located, e.g. in `toolbar.ts` or a tiny `ui.ts`). **Why behaviour-preserving:** same
      element/text/handler; classes stay per-panel via the arg. *Effort S.* *(The old "slider row
      duplicated (temperature + normal)" is DISSOLVED — there is now a single `buildSlider` called in
      a loop and no separate temperature row in the panel; see Solved.)*
- [ ] **`styles.css` repeats the button base 5×.** `.lie-crop-preset-btn` (`styles.css:381`),
      `.lie-filter-preset-btn` (`:421`), `.lie-class-dropdown-item` (`:465`), `.lie-submenu-icon-btn`
      (`:497`) and `.lie-size-choice` (`:516`) each redeclare `border-radius`, `cursor: pointer`,
      transparent background and `:hover { background: var(--background-modifier-hover) }`. Add one
      base `.lie-btn` (the shared rules) and let each keep only its specifics. **Why
      behaviour-preserving:** the computed styles are unchanged if the markup also gets the base class
      (a docs-only proposal — implementing it touches `.ts` + CSS together; mark the CSS+class pair as
      one change). *Effort M.*

Behaviour-near — verify carefully (L8 / L10 / Bug-2 territory):

- [ ] **Embed-matching regexes are spread across six modules** with overlapping but
      *deliberately different* capture groups: `image-resolver.ts:18-19` (`WIKI_EMBED`/`MD_EMBED`,
      global, path + block), `link-format.ts:19-20` (`WIKI`/`MD`, caption + path + block),
      `live-preview-logic.ts:5,15` (`EMBED_LINE`/`INLINE_EMBED`, whole-line anchored), `caption-logic.ts:17,24`
      (caption only), `live-preview.ts:34,41,187-188` (highlight split + file resolve), `main.ts:254`
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
> - `RevealMode = "auto"|"always"|"hidden"` (`live-preview.ts:19`) is **not** the retired tri-state
>   cycle — it is a derived display state (auto/always from the setting, hidden from the `<>` toggle);
>   `cycleRevealMode` is gone. Leave it.

> **Behaviour-affecting — NOT a pure refactor, flagged for a decision (do NOT bundle into the pure pass):**
> - **`temperatureAdjust` (`transforms.ts:307-320`) is dead in `src/`** — exported and unit-tested
>   (`tests/transforms.test.ts`) but with **no production caller** (the filter panel builds no
>   temperature row). It backs F11 (the virtual temperature control), so removing it *drops a
>   documented capability* — that is a requirements decision (reopen F11), not a refactor. Either wire
>   the temperature slider back into `filter-panel.ts` (restores F11) or retire F11 + the function +
>   its test. **Behaviour-risk — excluded from the pure-refactor list.**

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
