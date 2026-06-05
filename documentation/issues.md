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
- [ ] **Enter=accept is captured globally while a panel is open (verify it doesn't surprise).** The
      shared host captures Enter→accept (and Esc→cancel) on `document` while open, so an Enter pressed
      with focus back in the editor accepts-and-closes rather than inserting a newline. This matches
      the active-region/modal-ish model (the panel is the focus while open) and pairs Enter with ✓,
      but revisit if it ever feels wrong — e.g. scope the capture to focus within the panel/region.
      (Submodal accept/cancel rework, 2026-06-05.)
- [ ] **F14 lists Export among the shared-host panels, but Export uses the native save dialog.** Crop,
      Filters and Resize go through `AnchoredSubmenu`; Export is a one-shot native dialog
      (`export.ts`, AD9/F13), never a live-preview panel. Pre-existing wording, surfaced while
      pulling F14 to IST for the accept/cancel rework — decide whether to reword F14 ("…and Export"
      → "Export uses the native dialog") or leave it as the conceptual grouping.

- [ ] **`data-`-prefix the runtime-only keys on WRITE? (cross-renderer HTML5-validity).** The writer
      emits bare `rotate=` / `flip=` / `transform=` / `filter=`; in foreign output these land verbatim as
      non-standard `rotate="…"` attributes (python-markdown — browser-inert but not valid HTML5) or as
      `data-rotate="…"` (Pandoc prepends `data-` → valid HTML5). The runtime already READS both
      spellings (`runtime.ts` claim selector), so writing the `data-` prefix ourselves would make the
      no-plugin output valid HTML5 everywhere — at the cost of a longer hand-edited block (T11
      brevity). Current lean: **keep bare keys** (already browser-inert and shorter); revisit only if
      HTML5 validity of the *exported* page matters. Surfaced by the cross-renderer fallback research
      (2026-06-04) — see implementation-plan §2.2b + memory `img-attr-fallback-prior-art`.

### Verifications (need eyes on a real / focused window)

- [ ] **Reading-view-specific render + native save dialog — focused-window pass.** The interactive
      panels (crop / filter / size) and the **F2 duplicate-resolution render path** are now verified
      live in a focused window (`verify-render-gaps` 4/4 incl. the occurrence-aware F2 checks;
      `verify-crop` 20/20; `verify-write-path` 14/14 incl. the Bug-33 dup rows). What still needs a
      focused **reading-view** pass (it doesn't render in a backgrounded/headless window) is the
      reading-view-SPECIFIC rendering — captions on a real captioned image and float/inline THERE — and
      the **native save dialog** (F13, not CDP-reachable). The pure logic each depends on is unit-tested.
- [ ] **Crop responsive scaling (#7).** Box-relative `translate%` + `width:100%` img should rescale a
      crop as the column narrows; structurally correct but not yet measured under a narrowing column.
- [ ] **Submodal + active-region + Bugs 1–3 — real-`:hover` travel only (structural part DONE).**
      The structural guards now actually RUN green live (2026-06-05 re-check, fresh build):
      `verify-submodal-icons` 16/16, `verify-submodal-region` 12/12, `verify-region-clickaway` 12/12,
      `verify-popup-region` 8/8 (read-source-back + synthetic enter/leave). What's left is the ONE
      thing CDP can't synthesize — the **real-pointer `:hover` CSS travel** and the visual feel:
      (a) the **floating** bar (outside the image rect) — hover image→bar→panel/popup and back must
      stay one region with no flicker; (b) the in-chrome bar stays **greyed the whole time** a panel is
      open (no one-frame un-greyed flash on re-entry); (c) ✓/✗ feel right. (Click-away leaving crop
      open, group-popup coupling, and the greyed-hidden states are now structurally proven, not just
      claimed — L14.)
- [ ] **Caption pure-CSS sizing** against the implemented new DOM (verified in isolation, not the
      real structure).
- [ ] **Toolbar container-query** with the box's aspect-ratio height (tested with an explicit px
      height, not the derived one).
- [ ] **`.cm-active` lock-step (verify).** Confirm the reveal class flips in lock-step with
      Obsidian's own source-reveal across edge cases (fallback signal: native widget DOM presence via
      `:has()`). Largely addressed by the HEAD pure-CSS model (`.cm-line:has(> .cm-formatting)`), but
      worth a final empirical confirm.
- [ ] **Detached-anchor commit — add a `verify-write-path.mjs` row.** The fix (commit on a panel whose
      anchor scrolled out uses the captured `ImageLocation`, not the basename scan) is unit/code-verified;
      its CONNECTED duplicate case is in the write-path matrix, but the DETACHED branch has no CDP row
      yet (needs synthesizing a scroll-out of a duplicated embed mid-edit). Add it when next in the
      crop/write-path code. (Resolved-by-finalization-pass, narrow trigger.)
- [ ] **Portable runtime (AB7a) + Export (F13) — re-verify + add a guard.** Both are recorded as
      **SOLVED✓CDP** from earlier sessions but were **NOT re-checked** in the 2026-06-05 finalization,
      and **neither has an automated guard**: `scripts/` carries no runtime/export/smoke check and
      `runtime-smoke.html` is a manual fixture. So the two least-covered paths are (a) the **portable
      runtime** — foreign-page hydration via `buildLayers`/`readTransform`, the runtime-only keys
      degrading to the original image; and (b) the **export canvas render** (`renderTransformedImage` —
      replay box geometry + native filter at original resolution). *Add:* a headless-browser check that
      hydrates `runtime-smoke.html` and asserts the built 3-layer structure + applied transform (CI-able,
      no Obsidian), and an export-render guard that drives `renderTransformedImage` and reads the output
      canvas back (the save DIALOG stays manual, F13).

### Known open bugs

- [ ] **`<>` dismiss doesn't hide the FRONT of the link on the cursor line (fights the native
      widget).** When the editor cursor is on the image's line, the `<>` dismiss fails to hide the
      **front part** of the raw link (the `![](…)` head) — it stays visible. *Hypothesis (diagnose
      first):* on the active line Obsidian reveals its **own native source tokens** (the real,
      editable `![…](…)` document text), and the dismiss only hides the plugin's overlay — the FAKE
      link (`.lie-fake-link`) + the `{…}` (`.lie-attr`) via `.lie-dismissed`. It cannot (and must not
      naively) hide Obsidian's native-revealed source, which is the document being edited — so the
      dismiss "loses the fight" with the native reveal on the cursor line (related to L11/L11b and the
      `.cm-active` lock-step note above). *Fix (top-down):* reconcile the dismiss with the native
      active-line reveal — e.g. on a dismissed line also suppress the native `![](…)` source tokens
      (scoped to that line) — **without** breaking native editing/selection of the source (L11). Needs
      a CDP diagnose of exactly what renders on the active line first.

*The auto-persist-on-anchor-disconnect bug is **SOLVED** (see the finalization-pass registry below);
the earlier clusters (Bug 25, Bugs 29–31, Bug 32, Bug 33, the LP-rendering-rework cluster) are in the
registry with their cause + fix. The crop drag haptics / pinch-sensitivity feel remains the one MANUAL
focused-window check.*

### Deferred design / elegance (DEFER)

- [ ] **Smaller chrome unification** — the resize handle, the anchored sub-menu and the filter-panel
      docking could all anchor to the uniform box through one mechanism. *(Crop-in-place and the
      portable runtime + bare-key format are DONE — see the registry.)*

### Planned features (need a requirements → architecture pass first)

New capabilities, not yet F-items. Per `methodology.md` each starts at the top (a Functional/Design
requirement + the storage/permission implications) before any code.

- [ ] **Settings-panel rework.** Restructure / redesign the settings tab (`settings.ts`, AB19) —
      grouping, clarity, and room for the new toggles below. Surfaced as its own UX pass, not a
      one-off addition.
- [ ] **Editing-toolbar integration — adapt & test (F23 / T10).** Revisit the integration with the
      *editing-toolbar* community plugin: re-check the version gate, the button (un)registration, and
      actually test it against current versions of that plugin. Off by default; currently the
      least-exercised path.
- [ ] **"Flatten & clean" a page / vault — IN PLACE (destructive, on the live vault).** A command
      that, for the selected note (or the whole vault): **exports every edited image** to a real file
      with the transforms baked in (F13 export, batched), **renames** so the baked file takes the
      **original's name** (the untouched original kept/renamed alongside), and **strips the `{…}`
      blocks** from the Markdown — turning the non-destructive edits into permanent files. *Decisions
      to make first:* what happens to the original (keep as `…-original`? move to a folder?), conflict
      / collision handling, undo/confirmation (this rewrites real files), and which transforms bake
      vs. stay (e.g. `align`/`width` are already faithful — do they bake or remain attributes?).
- [ ] **"Export" a page / vault — as a DOWNLOAD (non-destructive, off the live vault).** The same
      flatten-and-clean as above, but it produces a **separate downloadable copy** (a bundle of the
      baked images + the cleaned Markdown) and leaves the live vault **untouched**. Effectively the
      publish path: a portable, plugin-free copy of the notes. *Shares* the export + clean machinery
      with the in-place flatten; the only difference is target (a download bundle vs. the live files).
- [ ] **Reveal-source setting — ONE combined dropdown (F8 / F20).** Merge the existing *Always show
      the link source* toggle (auto / always) with the new reveal-line **layout** behaviour and a
      **hidden** option into a **single dropdown** (not scattered toggles). The four options, in order:
      1. **Immer** (always shown) ·
      2. **Auto — Höhe sichtbar** (reveal on hover / cursor line; the line **reserves its height** when
         hidden → **no jump** on reveal — the current default) ·
      3. **Auto** (reveal on hover / cursor line; the line **collapses** when hidden → the image
         **jumps** on reveal — the original Obsidian-like behaviour) ·
      4. **Ausgeblendet** (never shown / always hidden).

      So the two dimensions (when revealed: always / auto / never; and, in auto, reserve-height vs.
      collapse) fold into these four labels. This **supersedes** the boolean `alwaysShowLink`. Includes
      the layout/CSS logic (the reserved-height rule keyed on the choice) + the setting in `settings.ts`
      (AB19). The per-image `<>` toggle (F8) is a **transient override that flips the natural state**
      and then **auto-clears back to the default**:
      - Options 1–3: unchanged — whenever the `<>` control is reachable (hover / the toolbar) the
        source is already visible, so the toggle **dismisses** it (transiently; clears back to the
        revealed default as today).
      - Option 4 (**Ausgeblendet**): the source is hidden even while `<>` is reachable, so a click
        **reveals** that image's source, then **auto-clears back to hidden** (the default) — the same
        transient-override mechanism, just inverted.

### Under-specified details (SPEC)

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
- [ ] **Harden the CDP guard suite for reliable BATCH runs (L14).** Each `scripts/verify-*.mjs` passes
      individually on a fresh build, but running the whole set back-to-back degrades the live window
      (render churn over many fixture create/modify/delete cycles + reloads) → spurious flakes: transient
      single-image fixtures fail to render their overlay (crop/size steps then `cropOpened:false`), and
      the 9222 relay buffers the RUN-eval-then-poll → "RUN eval did not finish". *Add:* re-find live
      elements right before each action (never a stale captured ref), a retry-on-churn wrapper, and a
      `run-all` harness that reloads to a clean state between guards and prefers `CDP_PORT=9223` direct.
      The symptom is recorded in L14; this is the fix.

### DRY/KISS audit — re-grounded against HEAD (2026-06-05)

The 2026-06-04 audit was worked through in the finalization pass. **Done** — each a pure,
behaviour-preserving refactor (cause/why in **Resolved by the finalization pass** below): the
panel-opener location LOOKUP funnelled through one shared `locateActiveImage`; a single
`nonDefaultFilter` as the "≠ default" predicate (was iterated 3×); `BOX_CLASS` used instead of the
`"lie-image-area"` magic string in `main.ts`; the labelled preset-button build factored into
`textButton` (`ui.ts`) across the filter / size / crop panels; `parseLocationTransform` and the
dead `getPreset` / `setPresetWidth` removed. *(The crop-editor double-teardown and the `iconButton`
3×-repeat were already collapsed by the submodal rework — verified gone, not re-done.)*

**Still open — deferred with rationale (NOT cleanly behaviour-preserving):**

- [ ] **`styles.css` repeats the button base 5×** (`.lie-crop-preset-btn`, `.lie-filter-preset-btn`,
      `.lie-class-dropdown-item`, `.lie-submenu-icon-btn`, `.lie-size-choice` each redeclare
      `border-radius` / `cursor` / a background / `:hover`). A shared `.lie-btn` base would dedupe it,
      but it touches CSS **and** the markup of all five together and risks changing computed styles —
      the verification cost (computed-style read-back per button type) outweighs the cosmetic win.
      *Effort M; deferred.*
- [ ] **Embed-matching regexes spread across ~6 modules** with *deliberately different* capture
      groups (`image-resolver`, `link-format`, `live-preview-logic`, `caption-logic`, `live-preview`,
      `main.ts` native-size fold). Sharing only the embed-token sub-pattern is possible, but the
      composed regexes must match byte-for-byte — high risk, low reward; the audit's own guidance is
      **do not force one regex**. *Effort L; deferred (gate any attempt on the full embed-parsing
      suite).*

> **Rejected / not pursued (do NOT chase):**
> - The floating toolbar and the in-image toolbar are **not** a duplicate — both build via
>   `buildToolbarElement`; only host + positioning differ (intended, D1/D1.1).
> - `RevealMode = "auto" | "always"` is **not** a retired mode cycle — the two values derive from the
>   global default-state setting (`alwaysShowLink`); the `<>` dismiss is a SEPARATE per-line override
>   (a `lie-dismissed` line decoration, auto-clearing in auto mode). `cycleRevealMode` is gone.

### `*-logic.ts` split — KISS analysis (KEEP)

The pure `*-logic.ts` units stay split from their framework-coupled counterparts (AD7/T8/L6): the
logic is unit-testable without an obsidian/CM mock (the repo has **no vitest config and no mock**, by
design). `renderer-logic.ts` is a genuine shared unit (consumed by `render-core`, `live-preview`,
`export`). Merging any of the others would only save a file while forcing a test to import
obsidian/CM — the exact cost the split exists to avoid. The same discipline now also keeps
`image-resolver.ts` pure (`import type` Editor) so its resolvers are unit-tested. **Recommendation:
keep the split.**

---

## SOLVED / DONE

> Resolved work, kept as the cause+fix record. The **L1–L13** lessons and **Bug N** numbers are
> referenced by other docs and must keep resolving here. Status legend on bugs: **SOLVED**
> (code-verified) · **SOLVED✓CDP** (verified live in Obsidian).

### Resolved by the finalization pass (2026-06-05)

The clean-room render-path gaps, the F11 retirement, the dead-code sweep, the open
auto-persist-on-disconnect bug, and the pure DRY/KISS refactors. Build/lint/test green
(155 unit tests); the write-path matrix (14/14) + crop / submodal / reveal scripts re-run green;
new structural checks: `tests/image-resolver.test.ts` (F2), `tests/size-submenu-logic.test.ts`
(F24), `tests/render-core.test.ts` (CLAIM_SELECTOR), and `scripts/verify-render-gaps.mjs` (F24
live source read-back PASS; F2 reading-view SKIPs headless — see the reading-view manual bucket).

- [x] **F2 — reading-view render of a DUPLICATED image — SOLVED.** *Cause:* `reconcileFromSource`
      resolved every rendered image via `findImageInText(source, basename)` → the FIRST basename
      match, so the 2nd embed of a repeated file rendered the 1st's transform (the Bug-33 failure
      mode, on the render path; the post-processor was already correct via the sibling text node).
      *Fix (AB3, root):* the reconcile counts each basename's **occurrence in DOM order** (= source
      order) and resolves the n-th occurrence via the new occurrence-aware
      `findImageInText(text, src, occurrence)`; `image-resolver.ts` is made pure (`import type`
      Editor) so the resolver is unit-tested (`tests/image-resolver.test.ts`, fails on first-match).
- [x] **Filter `[filter]` in `CLAIM_SELECTOR` — SOLVED.** *Cause:* a bare `filter=` is runtime-only
      (a browser ignores the bare attribute), but the runtime's `CLAIM_SELECTOR` didn't list it, so a
      filter-only image was never hydrated on a foreign page. *Fix:* added `[filter]` + `[data-filter]`
      to `CLAIM_SELECTOR` (`readTransform` already reads `filter`); docs aligned — AD2 / T3 / F25 now
      list a bare `filter` among the runtime-only keys, `style="filter:…"` as the faithful escape.
      Pinned by `tests/render-core.test.ts`.
- [x] **F24 — "icon" preset couples to inline (F17) — SOLVED✓CDP.** *Cause:* the icon preset set only
      `height: 1.5em`, not the inline rendering, so it didn't flow as an icon. *Fix:* the preset table
      is now the pure `sizePresets` (`size-submenu-logic.ts`), where `icon` sets `inline=true` (+ the
      line-height height); the size sub-menu carries `inline` through preview/commit. Pinned by
      `tests/size-submenu-logic.test.ts` + `verify-render-gaps.mjs` (source read-back → `.lie-inline`).
- [x] **F11 temperature retired — DONE.** The virtual-temperature control had no production caller
      (the panel built no temperature row). Decided: retire it. Removed the dead `temperatureAdjust`
      (+ `clampNum`) and its tests, the `temperature` i18n key (en/de), and the stale filter-panel
      comments; struck temperature from `requirements.md` F11 and `architecture.md` AB13. (The rest of
      F11 — the seven sliders + presets — ships.) *(Supersedes the prior "wire it back or retire"
      decision item.)*
- [x] **Dead-code sweep — DONE.** Removed `getPreset` / `setPresetWidth` (the retired re-themeable
      `var(--lie-size-*)` write-model — presets bake to `width=N` px; no `--lie-size-*` var is defined
      anywhere) and `parseLocationTransform` (zero callers), with their tests. `MARKER_CLASS` has no
      set path (was already dropped in aff1847); the parser **skip** of a legacy `.lie-img` is kept
      (back-compat) — verified, nothing to remove there.
- [x] **Auto-persist on anchor-disconnect wrote the wrong occurrence of a DUPLICATED image — SOLVED.**
      *Cause:* a panel (crop/filter/size) that auto-persists when its anchor has scrolled out of the
      CM6 viewport mid-edit re-resolved the line from a now-DETACHED `activeImage`, so `locateImage`
      fell back to the basename scan → first occurrence. *Fix (root):* the shared `locateActiveImage`
      prefers the live image's `posAtDOM` only while it is **connected**; when detached it uses the
      `ImageLocation` **captured at panel-open** (passed as `modifyTransform(..., fallback)`), never the
      basename scan. The connected path is covered by the write-path matrix's Bug-33 dup row; the
      detached branch is code-verified (narrow trigger — duplicate + scroll-out mid-edit).
- [x] **Pure DRY/KISS refactors — DONE** (all behaviour-preserving): the five panel openers funnel
      through one shared `locateActiveImage`; `nonDefaultFilter` is the single "≠ default" predicate
      (`filterToCss` / `isDefaultFilter` / the filter panel share it); `main.ts` uses `BOX_CLASS` not
      the `"lie-image-area"` literal; the labelled preset-button build is one `textButton` (`ui.ts`)
      across the filter / size / crop panels. (See the re-grounded DRY/KISS audit under OPEN for the
      two deferred items + the kept `*-logic` split.)

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

### Resolved by the submodal accept/cancel + active-region rework (2026-06-05)

Two fixes on the shared sub-menu host (`AnchoredSubmenu`), folded into the canonical docs
(`requirements.md` F14/D6, `architecture.md` AD8, `implementation-plan.md` → `anchored-submenu.ts`).

- [x] **(A) Restored accept (✓) + cancel (✗) icons — WITHOUT changing auto-persist-on-leave.** The
      header now carries **reset · cancel (✗) · accept (✓)**. While open it is a pure live-DOM
      preview (no source write); the **exit REASON** is routed through the pure
      `submenuExitEffect` (`anchored-submenu-logic.ts`): **commit** (✓ accept, Enter, click-away,
      dismiss, context loss) → `onCommit` = exactly one source write / one undo step (auto-persist,
      unchanged); **cancel** (✗, Esc) → `onCancel` = DISCARD, no write, the owner re-renders the
      live DOM from the unchanged source (crop re-renders from `existing`; size/filter from
      `location.params`); **silent** (plugin unload) → neither. Esc = cancel, **Enter = accept**
      (confirmed with the user). Per-panel Reset kept. Pinned: `submenuExitEffect` unit
      (tests/anchored-submenu-logic.test.ts) + `scripts/verify-submodal-icons.mjs` (read-source-back:
      ✓ writes the `{…}`, ✗ writes nothing AND restores the DOM, one undo step, leaving still
      persists). *Review follow-up:* `writeToSource` (main.ts) now skips a byte-identical dispatch, so
      an UNCHANGED size/filter accept/leave adds no redundant undo step (was a self-replacing write;
      crop was already dirty-guarded) — one undo step per ACTUAL edit, uniformly.
- [x] **(B) Toolbar ↔ sub-modal = ONE active region (flicker bug).** The in-chrome toolbar's
      visibility was pure CSS `.lie-wrapper:hover`, so moving image→panel dropped the bar (and the
      panel could flicker) the instant the pointer left the image rect — before reaching the panel.
      Fix (D6): the host binds enter/leave on **all three** members (image region + panel +
      toolbar) with the existing grace delay bridging the travel gap, and toggles `.lie-region-active`
      on the toolbar in lock-step with the panel's visibility. New CSS keeps the toolbar visible
      (greyed) while the region is active and hides it **together** with the panel when the region is
      left — for the in-chrome bar (`.lie-toolbar-in-image.lie-toolbar-inactive.lie-region-active`)
      and the floating bar (`.lie-toolbar-floating.lie-toolbar-inactive:not(.lie-region-active)`)
      alike. Pinned: `scripts/verify-submodal-region.mjs` (synthetic enter/leave: grace keeps the
      region across the gap, leaving anywhere hides both together, re-entering via image/toolbar/panel
      restores both). *Review follow-up:* the greyed bar kept `pointer-events:none` (from
      `.lie-toolbar-inactive`), so a REAL pointer moving onto the FLOATING bar (which sits outside the
      image rect) fired no mouseenter → the region dropped (the float-case flicker survived). Fixed:
      `.lie-toolbar-inactive.lie-region-active { pointer-events: auto }` makes the greyed bar a hover
      surface while its buttons stay inert (D6); `verify-submodal-region.mjs` now also asserts the bar
      is pointer-hoverable + buttons inert (structural — the synthetic events couldn't catch it).
      *Manual:* the real-pointer `:hover` CSS travel path (not CDP-synthesizable) is a focused-window
      check.

### Resolved by the region visibility-coupling follow-ups (2026-06-05)

Three real-pointer bugs found on the new "one active region" from the rework above. Root cause shared:
**TWO competing visibility signals** — the in-chrome bar's pure CSS `.lie-wrapper:hover` vs. the JS
`hoverShown`/`.lie-region-active` state — which desync. The fix makes **one** signal drive everything.
Folded into the canonical docs (`requirements.md` F14 + D6.2/D6.3/D6.4, `architecture.md` AD8 +
AB11/AB11a, `implementation-plan.md` §1 + §3.4). New units: `src/toolbar-region-logic.ts`
(`clickDismissesToolbar`, pure/tested) + `src/region-hover.ts` (`bindRegionHover` /
`couplePaletteToRegion`, the shared DOM binder — `anchored-submenu.ts` now reuses it, DRY).

- [x] **Bug 1 — Click-away closes the sub-panel (crop EXEMPT).** The document-click delegate dismissed
      via `dismissToolbar` which closed crop too, so a stray click outside the image destroyed an
      in-place crop session. Fix: the delegate now consults the pure `clickDismissesToolbar({insideRegion,
      cropActive})` — an active click OUTSIDE the region closes+persists **filter/size** (auto-persist,
      one source write, unchanged), but while **crop** is active NO outside click dismisses (clicks/drags
      on the image, handles and the dimmed ghost are editing; crop ends only via its own toggle / ✓ / ✗ /
      Esc). The IMG-reselect branch is likewise skipped during crop. Pinned: `tests/toolbar-region-logic.test.ts`
      + `scripts/verify-region-clickaway.mjs` (read-source-back: filter/size close+persist+one-undo; crop
      stays open with no write).
- [x] **Bug 2 — Panel visibility FIRMLY coupled to toolbar visibility (no in-between state).** Open a
      panel (bar greyed) → leave → the bar could flash **un-greyed** while the panel was open, because
      the CSS `:hover` rule (`opacity:1`, 0,3,0) *out-specified* `.lie-toolbar-in-image.lie-toolbar-inactive`
      (`opacity:0`, 0,2,0) and raced the async `.lie-region-active` toggle. Fix: the in-chrome bar's
      `:hover`/`:focus-within` rules now carry `:not(.lie-toolbar-inactive)`, so the moment a panel
      opens the CSS `:hover` stops competing and the bar's visibility + staying-greyed ride the host's
      ONE region signal alone (`.lie-region-active`). The bar stays greyed the **whole** open duration;
      hover-leave hides bar+panel together (panel stays open), hover-return shows them together. The
      shared binder also tracks a member **set** (nesting-robust: toolbar→image stays inside). Pinned:
      `verify-submodal-region.mjs` extended (shown bar = opacity 0.4 never 1; hidden = opacity 0 and
      still `.lie-toolbar-inactive` the whole time).
- [x] **Bug 3 — Group popups / class dropdown coupled like Bug 2, but NOT greyed.** The folded-group
      popups (`.lie-group-popup`) and the add-class dropdown (`.lie-class-dropdown`) live on
      `document.body` (outside the wrapper paint box), so hovering them dropped `.lie-wrapper:hover` and
      the in-chrome bar vanished. Fix: `couplePaletteToRegion` binds the palette + wrapper + toolbar as
      ONE region (the same binder) and marks the wrapper `.lie-region-hover` while hovered — the new CSS
      `.lie-wrapper.lie-region-hover .lie-toolbar-in-image:not(.lie-toolbar-inactive)` keeps the bar
      visible (NOT greyed — palettes are not modal) — and closes the palette when the region is left, so
      bar + palette fade together. `.lie-class-dropdown` is also added to the region selector + the
      floating-bar mouseover guard. Pinned: `scripts/verify-popup-region.mjs` (popup keeps the region,
      bar stays visible+not-greyed, leaving closes both).

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
      `scripts/verify-crop.mjs` 20/20 (self-creates `_crop-fixture.md`; manual demo `examples/02 — Crop.md`).) *Post-review
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

- [x] **Temperature — RETIRED (F11).** The virtual-temperature control (`temperatureAdjust`, never
      wired to a panel row after the rework) was decided dead and removed in the finalization pass
      (2026-06-05) — see **Resolved by the finalization pass** above. F11 keeps the seven sliders +
      named presets; the function, its test, the `temperature` i18n key and the stale panel comments
      are gone, and `requirements.md` F11 / `architecture.md` AB13 no longer mention temperature.

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
- **L14 — "Verified" requires a REBUILT vault AND a guard that actually RUNS** (the over-claim trap;
  surfaced by the 2026-06-05 finalization re-check). A fix is not verified just because the code is
  written and a guard script exists. Two failures bit at once: (1) the dev **vault build was stale** —
  the region-coupling + submodal-rework source was written but the installed
  `examples/.obsidian/plugins/live-image-editor/main.js` was an earlier snapshot missing
  `clickDismissesToolbar`/`bindRegionHover`, so any script tested OLD code; (2) two guards
  (`verify-submodal-region.mjs`, `verify-popup-region.mjs`) had **literal backticks inside their
  `EVAL_RUN` template literal** — which closes the template early → `ReferenceError` at module load →
  they had **never executed**. So the "pinned" claim was hollow. *Rule:* before writing "verified",
  rebuild + install the dev build (`npm run build:dev` + copy to the vault, or `dev:vault`) +
  `location.reload()`, then RUN the guard and read its PASS lines. After the rebuild + script fixes
  all 10 guards passed live (write-path 14/14, render-gaps 4/4, reveal 5/5, crop 20/20, crop-teardown
  all-paths, crop-pan 11/11, submodal-icons 16/16, submodal-region 12/12, region-clickaway 12/12,
  popup-region 8/8). Two test corrections went with it: an over-strict `opacity === "0"` read the
  ease-tail mid-fade (→ tolerance `< 0.05`), and `verify-crop-teardown`'s old "clickaway" exit
  contradicted the Bug-1 crop-exemption (→ a context-loss teardown path instead). (d) **CDP channel:**
  prefer **9223 direct** for the RUN-eval-then-poll guards — the 9222 relay can buffer so the async
  RUN eval's `window.__X` is read from a different context (spurious "RUN eval did not finish"). The
  live window also **degrades under dense fixture churn** (many create/modify/delete + reloads):
  transient single-image fixtures can fail to render their overlay, making crop/size steps flaky — run
  guards individually with a settle gap, or reload to a clean state.

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
