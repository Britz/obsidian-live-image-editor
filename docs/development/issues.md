# Open Items & Registry — Live Image Editor

> The backlog + lessons for the plugin, in two parts:
>
> 1. **OPEN — checklist at the top.** Everything still to do, as `- [ ]` items grouped by kind
>    (open decisions, verifications, deferred ideas, DRY/KISS, known open bugs, housekeeping). Tick
>    them off as they land. Items marked **(verify)** could not be confirmed from code/commits and
>    need a check. The **[Release-Requirement]**-tagged items were the community-directory submission
>    gate (the former standalone `RC1–RC11`); **all of them are now CLOSED in v0.4.2** (Bugs 68–72 +
>    Change 25 — see the changelog), so the only remaining release work is the manual packaging
>    checklist. The full pass/fail audit record (rules `R1–R30`, with sources — now all ✅) and the
>    manual submission checklist live in the top-level [README → Release compliance](https://github.com/Britz/obsidian-live-image-editor/blob/main/README.md#release-compliance).
> 2. **Meta level — below OPEN.** Process & quality work that never becomes a changelog entry —
>    **verifications**, **refactoring**, **housekeeping** — plus the hard-won **Lessons**
>    (**Lesson 1–17**), each a bug-class + the rule that prevents it. All unnumbered.
>
> The resolved **Bug**, **Feature**, **Change** and **Decision** entries (each with its cause + fix)
> live in [`CHANGELOG.md`](../../CHANGELOG.md), numbered per category and split across the version each
> shipped in. `[ ]`/`[x]` checkboxes live only in **OPEN**.
>
> **Numbering policy — own number, own item; never reused.** Bug / Feature / Change / Decision numbers
> form one per-category sequence shared with the changelog; an **OPEN** item gets its number the moment
> it is opened and **keeps it** when it ships (→ moves to the changelog). A recurring symptom with a
> **different cause** is a NEW item with a NEW number, not a reopen. **Meta level** content
> (verifications, refactoring, housekeeping, and the **Lessons**) is process & quality work that never
> becomes a changelog entry — it stays here and is **not** numbered into those sequences; Lessons keep
> their own `Lesson N` sequence.

---

## OPEN

Numbered registry items — each will move to the changelog keeping its number once DONE.

### Open decisions (Decision)

_**29 decisions total** — all resolved (→ [`CHANGELOG.md`](../../CHANGELOG.md))._

### Planned features (Feature)

_**39 features total** — shipped (→ [`CHANGELOG.md`](../../CHANGELOG.md)) except the planned ones below._

New capabilities, not yet F-items. Per `methodology.md` each starts at the top (a Functional/Design
requirement + the storage/permission implications) before any code.

- [ ] **Feature 31 — "Flatten & clean" a page / vault — IN PLACE (destructive, on the live vault).** A command
      that, for the selected note (or the whole vault): **exports every edited image** to a real file
      with the transforms baked in (F13 export, batched), **renames** so the baked file takes the
      **original's name** (the untouched original kept/renamed alongside), and **strips the `{…}`
      blocks** from the Markdown — turning the non-destructive edits into permanent files. _Decisions
      to make first:_ what happens to the original (keep as `…-original`? move to a folder?), conflict
      / collision handling, undo/confirmation (this rewrites real files), and which transforms bake
      vs. stay (e.g. `align`/`width` are already faithful — do they bake or remain attributes?).
- [ ] **Feature 32 — "Export" a page / vault — as a DOWNLOAD (non-destructive, off the live vault).** The same
      flatten-and-clean as above, but it produces a **separate downloadable copy** (a bundle of the
      baked images + the cleaned Markdown) and leaves the live vault **untouched**. Effectively the
      publish path: a portable, plugin-free copy of the notes. _Shares_ the export + clean machinery
      with the in-place flatten; the only difference is target (a download bundle vs. the live files).
- [ ] **Feature 33 — Reveal-source setting — ONE combined dropdown (F8 / F20).** Merge the existing _Always show
      the link source_ toggle (auto / always) with the new reveal-line **layout** behaviour and a
      **hidden** option into a **single dropdown** (not scattered toggles). The four options, in order: 1. **Immer** (always shown) · 2. **Auto — Höhe sichtbar** (reveal on hover / cursor line; the line **reserves its height** when
      hidden → **no jump** on reveal — the current default) · 3. **Auto** (reveal on hover / cursor line; the line **collapses** when hidden → the image
      **jumps** on reveal — the original Obsidian-like behaviour) · 4. **Hidden** (never shown / always hidden).

            So the two dimensions (when revealed: always / auto / never; and, in auto, reserve-height vs.
            collapse) fold into these four labels. This **supersedes** the boolean `alwaysShowLink`. Includes
            the layout/CSS logic (the reserved-height rule keyed on the choice) + the setting in `settings.ts`
            (AB19). The per-image `<>` toggle (F8) is a **transient override that flips the natural state**
            and then **auto-clears back to the default**:
            - Options 1–3: unchanged — whenever the `<>` control is reachable (hover / the toolbar) the
              source is already visible, so the toggle **dismisses** it (transiently; clears back to the
              revealed default as today).
            - Option 4 (**Hidden**): the source is hidden even while `<>` is reachable, so a click
              **reveals** that image's source, then **auto-clears back to hidden** (the default) — the same
              transient-override mechanism, just inverted.

- [ ] **Feature 34 — Ship the user's MODIFIED in-vault snippets with the runtime (not just the default stack).**
      The standalone runtime now injects the plugin's DEFAULT decoration snippet (F16.1 —
      `rounded/shadow/bordered/circle`) so a foreign page renders class-styled images like Obsidian
      (`src/bundled-snippet.ts`, the single source shared by plugin + runtime). Open extension: carry
      the user's ACTUAL, possibly-edited snippet CSS (and the other image snippets they have enabled)
      into the exported/published runtime, so a vault with customized classes renders faithfully
      off-Obsidian. _Decisions first:_ which snippets travel (only ones `lie` images apply? all enabled
      image snippets?), how they travel (baked into a per-site CSS at export vs. a runtime config),
      Obsidian theme-var dependencies (`var(--background-modifier-border)` & friends don't resolve
      off-Obsidian), and scoping/collision with the host site's own CSS.
- [ ] **Feature 37 — A "Save" sub-panel in the in-image toolbar — group Replace + Export under one trigger.**
      Add a `save` trigger to the toolbar that opens a small sub-panel grouping **Replace** (Feature 35)
      and **Export** (F13); the standalone Export button moves into it. The Replace command and its
      editing-toolbar entries already exist (v0.6.0) — this is the UI grouping pass (panel + tests).
- [ ] **Feature 38 — Collapsed submenus auto-expand on hover + show a dropdown caret (▾).** Like the
      editing-toolbar: a folded toolbar group should sprout a small caret hinting it's expandable, and
      open on **hover** (not only click). Small polish — explicitly NOT in the v0.6.0 release. (2026-06-06.)
- [ ] **Feature 39 — Popout-window support (`activeDocument` / `activeWindow` throughout).** The Obsidian
      review bot flags `obsidianmd/prefer-active-doc` as WARNINGS across ~all files: every bare
      `document` / `window` reference assumes the main window and is wrong when the note (and its
      images/toolbar/panels) live in a **detached popout window**. Converting them to `activeDocument`
      / `activeWindow` (Obsidian's window-aware globals) is the real fix, but it is large, cross-cutting
      churn (~100 sites: `render-core`, `live-preview`, `toolbar`, the panels, `crop-editor`, `caption`,
      `export`, …) with real regression risk and **no review-failing impact** (warning-level), so it is
      deferred and kept off in `lint:obsidian` by deliberate decision (Decision 29 — not a blind
      suppression). _Do first:_ confirm whether the plugin is even reachable in a popout (its hosts: LP
      editor + reading-view embeds) and scope which references are genuinely main-window-only (e.g. the
      `localStorage` language read) vs. document-relative. (2026-06-07.)

### Known open bugs (Bug)

_**91 bugs total** — all resolved (→ [`CHANGELOG.md`](../../CHANGELOG.md)) except the ones still open below._

- [ ] **Bug 65 — `<>` dismiss doesn't hide the FRONT of the link on the cursor line (fights the
      native widget).** When the editor cursor is on the image's line, the `<>` dismiss fails to hide the
      **front part** of the raw link (the `![](…)` head) — it stays visible. _Hypothesis (diagnose
      first):_ on the active line Obsidian reveals its **own native source tokens** (the real,
      editable `![…](…)` document text), and the dismiss only hides the plugin's overlay — the FAKE
      link (`.lie-fake-link`) + the `{…}` (`.lie-attr`) via `.lie-dismissed`. It cannot (and must not
      naively) hide Obsidian's native-revealed source, which is the document being edited — so the
      dismiss "loses the fight" with the native reveal on the cursor line (related to Lesson 11/Lesson 12 and the
      `.cm-active` lock-step note above). _Fix (top-down):_ reconcile the dismiss with the native
      active-line reveal — e.g. on a dismissed line also suppress the native `![](…)` source tokens
      (scoped to that line) — **without** breaking native editing/selection of the source (Lesson 11). Needs
      a CDP diagnose of exactly what renders on the active line first.
- [ ] **Bug 67 — toggling Obsidian's line-break mode makes FLOATED images vanish in Live Preview
      (stale in-place decoration); intermittent.** Obsidian's editor **"Strict line breaks"** setting
      switches between _hard_ breaks (a single newline renders as a break — the **default**) and
      _Markdown_ breaks (a break needs a blank line / `<br>`). On the **default (hard breaks)** an
      **extra leading line appears above floating images**; turning the setting OFF removes it. _Bug:_
      in exactly that float case, **flipping the setting makes the floated images disappear** in LP —
      bare/non-float images kept rendering. **Closing and reopening the note** brings them back in
      either mode, so the document does render correctly — only the **in-place re-render** doesn't
      refresh. _Hypothesis (diagnose first):_ the LP decoration `StateField` only rebuilds on
      `docChanged | selection | modeChanged (LP↔source) | dismissedChanged | refreshDecorations`
      ([live-preview.ts:369-383](src/live-preview.ts#L369-L383)); the _Strict line breaks_ toggle
      reconfigures the editor without firing any of those, so the float widget decorations go **stale**
      → the floated embeds drop until the field is rebuilt from scratch on re-open
      ([live-preview.ts:create()](src/live-preview.ts#L366)). _Fix (likely):_ also rebuild on the
      relevant reconfigure/`editorInfoField`-style signal (or dispatch `refreshDecorations` from the
      plugin when this config changes). _Caveat:_ the user could **no longer reproduce it** after the
      first occurrence — confirm with a CDP/focused repro (toggle Settings → Editor → _Strict line
      breaks_ with a floated `{ .lie-left }` embed on screen) before fixing. Reported 2026-06-05 (user).
- [ ] **Bug 76 — The standalone runtime doesn't center an `align=center`-only image on a published
      page.** The portable runtime claims an `<img>` only via `CLAIM_SELECTOR`
      (`[rotate],[flip],[transform],[aspect-ratio],[filter],.lie` + the `data-*` spellings,
      [render-core.ts:331](src/render-core.ts#L331)) — `align` / `width` ALONE never claim. For
      `align=left` / `right` that is correct: the bare `align="left"` / `"right"` attribute floats
      natively via legacy HTML (faithful with no plugin and no runtime). But `align="center"` is a no-op
      on an `<img>`, and the runtime's centering rule keys on the marker class
      (`.lie-image-area:has(img.lie-center){…margin:auto}`, [runtime.ts](src/runtime.ts)), which
      `buildLayers` only adds **on a claim**. So a center-aligned image with NO other transform is
      **not** centered on a foreign / published page (it stays inline) — left/right work, center
      silently degrades. The render-core comment "`align`…ALONE do not claim (native CSS already handles
      them faithfully)" ([render-core.ts:326](src/render-core.ts#L326)) over-states the center case.
      _Fix (mirrors Bug 58, which added `[filter]` to the claim selector):_ add `[align]` /
      `[data-align]` to `CLAIM_SELECTOR` (so the runtime builds the box + marker and centers it), or add
      a no-claim `:has(img[align="center"])` / `[align="center"]` rule to `RUNTIME_CSS`. In Obsidian
      itself this never bites — every image renders through `buildLayers` (R0), so the marker is always
      present; only the standalone runtime's claim gate is selective. Surfaced by the cross-renderer
      fallback research (memory `img-attr-fallback-prior-art`: "align=left/right faithful … no center
      value though"). Found via memory harvest 2026-06-06.
- [ ] **Bug 80 — Crop edge/corner handles stretch the whole image instead of moving only the grabbed
      edge/corner (D8, Decision 24).** Each handle must reshape the crop WINDOW from its own side — the
      grabbed corner/edge moves, the opposite side stays anchored. **Corners** keep the aspect ratio
      (aspect-locked); **edges** are single-axis. The current in-place editor stretches the inner image
      on an axis, which is wrong. Fix in the crop drag geometry (`crop-editor` / `crop-editor-logic`).
      DEFERRED — batch with any future crop-component bug. (Decision 24; 2026-06-06.)
- [ ] **Bug 82 — Export doesn't bake a `style="filter:…"` (outer-box) filter.** `renderTransformedImage`
      applies only `transform.filter` (the inner-image `filter=`, [export.ts:74](src/export.ts#L74)); a
      filter written via `{style="filter:…"}` lands on the OUTER box (`t.box.filter`, render-core
      `routeBoxStyle`) and is NOT composed into the export canvas → the exported PNG misses it. LOW
      PRIORITY / edge case — the editor deliberately authors filters only via `filter=`; only expert
      hand-written style-filters hit this. Fix (if ever): compose the box filter outside-in over the img
      filter in the export render. (Decision 23; 2026-06-06.)
- [ ] **Bug 84 — Filter histogram should also reflect the CROP, not just the filter.** Bug 83 made the
      histogram track the live `filter=`; but a crop changes the visible tonal distribution too (it cuts
      parts of the image away). The histogram should sample the **rendered R0 result** (cropped + filtered
      visible region) — e.g. reuse the export's `renderContent` ([export.ts](src/export.ts)) to produce the
      rendered canvas, then histogram THAT, which also fits the R0 uniform-render model. DEFERRED — track
      only. (Decision 23 follow-up; 2026-06-06.)
- [ ] **Bug 86 — Link-reveal visibility changes during crop, making the image jump.** While crop is
      active, the raw-link reveal (the `.lie-fake-link` / `<>` reveal line) can toggle (cursor moves on/off
      the line, or the reveal state flips), which reflows the line and **shifts the image inside the crop
      editor** — confusing mid-crop. Fix: freeze the reveal visibility for the crop duration (no
      reveal/dismiss changes while `.lie-cropping` is active). DEFERRED — track only. (2026-06-06.)

---

## Meta level

Process & quality work — stays in `issues.md`, **not** numbered into the changelog sequences.

### Verifications (need eyes on a real / focused window)

_Ticked off in v0.6.0: the **native save dialog** (F13, macOS) and the **crop drag / pinch + trackpad
rotate** (Feature 23) were user-verified 2026-06-06. The remaining items:_

- [ ] **Reading-view render — focused-window pass.** Run once with Obsidian in the FOREGROUND on the
      current build (F2 + captioned / floated rendering THERE). Reading view DOES now render in a
      backgrounded/headless run AS LONG AS the Obsidian window is in the foreground; a CDP run here was
      SKIPPED because the window was backgrounded (a fully backgrounded window still won't render — see
      Lesson 15c).
- [ ] **Crop responsive scaling (Decision 2).** Box-relative `translate%` + `width:100%` img should
      rescale a crop as the column narrows; measure under a narrowing column (after Bug 78).
- [ ] **Toolbar container-query** with the box's derived aspect-ratio height (tested so far only with
      an explicit px height).
- [ ] **Detached-anchor commit — add a `verify-write-path.mjs` row.** Synthesize a scroll-out of a
      duplicated embed mid-edit (the commit uses the captured `ImageLocation`, not the basename scan);
      the CONNECTED duplicate case is already in the matrix.
- [ ] **Portable runtime (AB7a) + export canvas — add a headless guard.** A headless-browser check that
      hydrates `tests/runtime-smoke.html` and asserts the built 3-layer structure + applied transform,
      plus an export-render guard that drives `renderTransformedImage` and reads the output canvas back.
      The save DIALOG itself is done.

### Refactoring (deferred — a mix of verify & change)

_These date from the 2026-06-05 DRY/KISS analysis — re-validate that each still applies before acting;
when one is actually carried out it ships as a **Change** in the changelog._

- [ ] **`src/` file-structure pass — group the flat module set into speaking subfolders.** `src/` is
      essentially flat (~34 files, only `i18n/`); a file-level grouping (e.g. `render/`, `ui/`,
      `logic/`, `platform/`) would make the module map self-evident. Fold this into the **pending
      file-level code refactor** rather than doing it standalone — it is a broad import sweep and the
      module map in `implementation-plan.md` must be updated in lock-step. _(The `tests/` split into
      `tests/unit/` + `tests/cdp/` is the matching, already-done move on the test side.)_
- [ ] **`styles.css` repeats the button base 5×** (`.lie-crop-preset-btn`, `.lie-filter-preset-btn`,
      `.lie-class-dropdown-item`, `.lie-submenu-icon-btn`, `.lie-size-choice` each redeclare
      `border-radius` / `cursor` / a background / `:hover`). A shared `.lie-btn` base would dedupe it,
      but it touches CSS **and** the markup of all five together and risks changing computed styles —
      the verification cost (computed-style read-back per button type) outweighs the cosmetic win.
      _Effort M; deferred (DRY/KISS audit, 2026-06-05)._
- [ ] **Embed-matching regexes spread across ~6 modules** with _deliberately different_ capture
      groups (`image-resolver`, `link-format`, `live-preview-logic`, `caption-logic`, `live-preview`,
      `main.ts` native-size fold). Sharing only the embed-token sub-pattern is possible, but the
      composed regexes must match byte-for-byte — high risk, low reward; the audit's own guidance is
      **do not force one regex**. _Effort L; deferred (DRY/KISS audit — gate any attempt on the full
      embed-parsing suite)._
- [ ] **Two Reading-view resolution passes over the same images** — `postProcessor` (sibling text node,
      [main.ts:141](src/main.ts#L141)) and `reconcileFromSource` (source scan,
      [main.ts:285](src/main.ts#L285)) both render the Reading view, with DIFFERENT resolution
      strategies. Idempotent via `resetLieState`, so it's a mild T6 ("one path per mode") tension, not a
      bug; unifying them is real surgery for low reward. _Effort M; deferred (DRY/KISS audit — gate on
      the reading-view focused-window pass)._ (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **Finish the dead-code sweep — `getClassNames` / `getAvailableClasses` (`styles-injector.ts`).**
      The 2026-06-05 sweep removed `getPreset` / `setPresetWidth` / `parseLocationTransform` but MISSED
      this pair — both have zero callers in `src/` and `tests/`
      ([styles-injector.ts:86](src/styles-injector.ts#L86)). Clean removal (no behaviour change).
      (Clean-room analysis reconcile, 2026-06-05.)

### Housekeeping

- [ ] **Harden the CDP guard suite for reliable BATCH runs (Lesson 16).** Each `tests/cdp/verify-*.mjs` passes
      individually on a fresh build, but running the whole set back-to-back degrades the live window
      (render churn over many fixture create/modify/delete cycles + reloads) → spurious flakes: transient
      single-image fixtures fail to render their overlay (crop/size steps then `cropOpened:false`), and
      the 9222 relay buffers the RUN-eval-then-poll → "RUN eval did not finish". _Add:_ re-find live
      elements right before each action (never a stale captured ref), a retry-on-churn wrapper, and a
      `run-all` harness that reloads to a clean state between guards and prefers `CDP_PORT=9223` direct.
      The symptom is recorded in Lesson 16; this is the fix.

_(The release-requirement housekeeping items RC1/R20, RC8/R27, RC9/R28 and RC10/R29 are DONE in
v0.4.2 — see Change 25 in the changelog.)_

### Hard-won lessons (Lesson 1–17) — must never be re-broken

These were tagged `[LEARNED]` / `T-Ln`. Each is a _bug class_ + the rule that prevents it; the
architecture encodes most in its decisions (`AD…`).

- **Lesson 1 — An un-replaced image line re-fires Obsidian's native embed (now WANTED).** _Observation
  (still true):_ an un-replaced line makes Obsidian render its own native embed and leave the trailing
  `{…}` as visible text (CDP-verified). _Superseded conclusion:_ the old "always replace the whole
  line" fix is gone. The native embed is now **embraced** (it loads the image and gives Obsidian's own
  cursor-reveal of the source); the plugin draws its OWN transformed image as the R0 widget
  and **suppresses** the native image with **uniform** static CSS (hides Obsidian's `> img` and
  `> .image-wrapper` in _every_ embed, never the plugin's `.lie-wrapper`); the `{…}` is real document
  text hidden by CSS while rendered, shown when the line is active. (→ AD5.)
- **Lesson 2 — Use a StateField, NOT a ViewPlugin.** _Cause:_ ViewPlugins can't emit block decorations.
  _Fix:_ a StateField rebuilt on doc/selection/mode change; it adds the plugin's own overlay widget
  alongside the (CSS-hidden) native embed. Reveal-for-looking and the hide-when-rendered are static
  CSS keyed on hover/focus and `.cm-active`; editing is Obsidian's native cursor-reveal — no
  plugin-owned editable field. (→ AD5.)
- **Lesson 3 — Store transforms only in the trailing `attr_list` block.** _Cause:_ encoding in alt text or
  via wikilink pipe tricks breaks portability (Python-Markdown / MkDocs / Pandoc). _Fix:_ canonical
  `{…}` block; alt text / native `|size` never repurposed; link type preserved. (→ AD1/AD2, T2.)
- **Lesson 4 — Never `disablePlugin` the plugin via CDP.** _Cause:_ the dev-bridge relay runs _inside_ the
  plugin, so disabling it locks CDP out, and the disable persists across reloads. _Fix:_ to observe
  native behaviour leave one line un-decorated; use `location.reload()` for a clean reload.
- **Lesson 5 — Don't route a wikilink's `|size` through the link-generator's `alias` argument.** _Cause:_
  it pushes the size into the alt text — _our_ bug, not Obsidian behaviour. _Fix:_ link conversion is
  defensive and never uses the alias arg. (→ AD9.)
- **Lesson 6 — Test behaviour via pure logic, not CDP.** _Cause:_ CM6/Obsidian don't resolve in vitest.
  _Fix:_ extract every decision into a pure `*-logic.ts` unit and unit-test it; CDP is only the final
  integration check. (→ AD7, T8.)
- **Lesson 7 — One consistent DOM structure for every image** (structural half of **R0**). _Cause:_ a
  `display:contents` "normal" special case (no real box) caused divergence. _Fix:_ the same real
  wrapper box for every variant; only size/transform differ, never the structure. (→ AD3.)
- **Lesson 8 — One render path per mode; no double-rendering.** _Cause:_ two competing async passes
  re-measured the rotated box at different available widths → inconsistent box/image sizes. _Fix:_ the
  live-preview overlay widget owns its own image; the reading-view reconcile skips the plugin's
  overlay images; no second retry beside the main one. (→ AD5.)
- **Lesson 9 — `params` passed to the attr parser must be the attr CONTENT, without the `{` `}` braces.**
  _Cause:_ with braces left on, the first token becomes `{.class` (starts with `{`, not `.`) and is
  silently dropped, while `style="…"` still parses — so in live preview the standalone classes
  (alignment, decoration) vanished while rotate/flip/filter/size worked, masking it. _Fix:_ strip the
  braces before parsing; regression test in `tests/unit/live-preview.test.ts`. (Was the root cause of Bug 24.)
- **Lesson 10 — Layout/measure retries must not rely on `requestAnimationFrame`/`ResizeObserver` ALONE.**
  _Cause:_ both are paused while the window is backgrounded/hidden (a second Obsidian window) → every
  image's box stuck at 0, captions left-aligned. Also: a cached image can be `complete` with
  `naturalWidth` momentarily 0 and no `load` event. _Fix:_ schedule each retry via rAF **and** a
  `setTimeout` fallback (guarded); don't gate the loop on `naturalWidth`. _(The new
  box→image / aspect-ratio-from-intrinsic model removes most of this surface.)_ (→ AD6.)
- **Lesson 11 — The live-preview adapter must NEVER replace the line; it renders ALONGSIDE the native embed
  (AD5).** _Cause (the user's hard rule, validated over a long test session):_ the only way to get
  native editable/selectable/copyable source text is to let Obsidian render its own embed and merely
  suppress it — a `Decoration.replace` (even of a non-active line) kills the native source, and a
  plugin-owned editable field reintroduces the caret seam. _Fix (the LP rendering rework):_ an
  **INLINE widget** (`side: 1`, in the embed's OWN non-BFC `.cm-line`) draws the plugin's own
  transformed image; CSS suppresses the native image **UNIFORMLY in every embed**
  (`.cm-content .internal-embed.image-embed > img, > .image-wrapper` — unscoped, cca476e), and the
  native edit-block-button is hidden unconditionally (the `<>` icon otherwise leaks, Bug 31). The
  `{…}` block is a `Decoration.mark` and a display-only `.lie-fake-link` carries the reveal-for-looking;
  both are shown by static CSS on cm-line hover / always-mode and hidden while editing (`.cm-active`,
  when the native source shows so the link is not doubled). _(Earlier this was a `block:true` widget
  BELOW the line; the rework moved it inline so `lie-left/right` floats escape the non-BFC line and wrap
  text. `block:true` now survives as the renderer for a BARE embed — a block-promoted line has no
  cm-line, so an inline widget would be swallowed; the block widget lands as its own `.cm-content` child
  next to the (image-suppressed) native embed. CDP-confirmed.)_
- **Lesson 12 — Obsidian keeps an image EMBED rendered even on the active line; only the trailing
  `{…}`/alt become editable text** (CDP-verified, markdown + wikilink). So native editing covers the
  transform block (the plugin's data — what matters), not the `![…]`/`![[…]]` link itself, which stays
  a (suppressed) embed. Obsidian's behaviour, embraced as required.
- **Lesson 13 — `container-type: size` on the box works, but collapses to 0×0 when the box's pane is
  `display:none`.** Reading-view boxes measured 0×0 while the editor pane was the hidden one; in the
  visible pane they size correctly. Not a bug — a measurement caveat (measure in the visible pane).
- **Lesson 14 — Bare embeds need NO `{…}` (the old normalization dependency is GONE — superseded by A/B'/C).**
  _Original cause (still true):_ Obsidian BLOCK-PROMOTES a bare `![](…)` standalone line into a
  `.cm-content`-direct `.internal-embed` with NO `.cm-line`, which would SWALLOW an _inline_ widget.
  _Original fix (now removed):_ an auto-normalizer appended `{.lie-img}` to keep the line inline.
  _Current resolution:_ render a bare embed with a **`block:true` widget** instead — it lands as its
  own `.cm-content` child (not in the line), so block-promotion is irrelevant; and the native image is
  suppressed UNIFORMLY (cca476e). The auto-normalization + the `autoNormalizeImages` setting were
  REMOVED (4053f95 — which also eliminated an undo loop), and the `.lie-img` marker dropped (aff1847;
  the parser still SKIPS it for old notes). So `{…}` is now written ONLY by a real plugin action, and
  no embed needs a marker or normalization to render. (→ AD5; memory `lp-rendering-rework-decisions`.)
- **Lesson 15 — Dev-process lessons.** (a) The **stale-build trap** — two quick saves under `dev:vault` can load
  an _intermediate_ build (e.g. a function renamed at the call site but not the definition →
  `ReferenceError`), looking like "rendering broke"; force a clean `location.reload()`. (b) The **CDP
  relay (9222) flaps after a plugin reload** (old socket lingers in TIME_WAIT) — connect directly to
  `CDP_PORT=9223` until it recovers. (c) **Reading view renders only while the Obsidian window is in
  the foreground** — Obsidian's reading-view renderer is visibility-driven, so a headless/backgrounded
  CDP run DOES render the reading view as long as the Obsidian window is in the foreground; a window
  that is itself fully backgrounded (e.g. a second window, or Obsidian behind another app) leaves
  `.markdown-preview-sizer` empty, so verify that path with the window in front. (See CLAUDE.md → Live
  debugging.)
- **Lesson 16 — "Verified" requires a REBUILT vault AND a guard that actually RUNS** (the over-claim trap;
  surfaced by the 2026-06-05 finalization re-check). A fix is not verified just because the code is
  written and a guard script exists. Two failures bit at once: (1) the dev **vault build was stale** —
  the region-coupling + submodal-rework source was written but the installed
  `example-vault/.obsidian/plugins/live-image-editor/main.js` was an earlier snapshot missing
  `clickDismissesToolbar`/`bindRegionHover`, so any script tested OLD code; (2) two guards
  (`verify-submodal-region.mjs`, `verify-popup-region.mjs`) had **literal backticks inside their
  `EVAL_RUN` template literal** — which closes the template early → `ReferenceError` at module load →
  they had **never executed**. So the "pinned" claim was hollow. _Rule:_ before writing "verified",
  rebuild + install the dev build (`npm run build:dev` + copy to the vault, or `dev:vault`) +
  `location.reload()`, then RUN the guard and read its PASS lines. After the rebuild + script fixes
  all 10 guards passed live (write-path 14/14, render-gaps 4/4, reveal 5/5, crop 20/20, crop-teardown
  all-paths, crop-pan 11/11, submodal-icons 16/16, submodal-region 12/12, region-clickaway 12/12,
  popup-region 8/8). Two test corrections went with it: an over-strict `opacity === "0"` read the
  ease-tail mid-fade (→ tolerance `< 0.05`), and `verify-crop-teardown`'s old "clickaway" exit
  contradicted the Bug-54 crop-exemption (→ a context-loss teardown path instead). (d) **CDP channel:**
  prefer **9223 direct** for the RUN-eval-then-poll guards — the 9222 relay can buffer so the async
  RUN eval's `window.__X` is read from a different context (spurious "RUN eval did not finish"). The
  live window also **degrades under dense fixture churn** (many create/modify/delete + reloads):
  transient single-image fixtures can fail to render their overlay, making crop/size steps flaky — run
  guards individually with a settle gap, or reload to a clean state.

- **Lesson 17 — Reproduce an EXTERNAL review's ruleset in a SEPARATE config; never inline-disable its
  rules in source** (surfaced by the 2026-06-06 Obsidian-review compliance pass). The community-plugin
  review runs `eslint-plugin-obsidianmd`, which is NOT in our shipped `eslint.config.mjs` (T9 — kept
  as-is). Two traps: (1) an inline `/* eslint-disable obsidianmd/<rule> */` to silence a genuine false
  positive (e.g. the standalone runtime's `<style>` injection) makes the **shipped** `npm run lint`
  FAIL with "Definition for rule … was not found" — that linter doesn't know the obsidianmd rules, and
  ESLint 9 also flags the directive as unused. So a disable comment that helps the review bot BREAKS
  our own gate. _Rule:_ recreate the review in a dedicated `eslint.obsidian.config.mjs` (`npm run
  lint:obsidian`) and document the off-Obsidian/dev-only flags as false positives — don't touch
  source with cross-plugin disables. **(Superseded re: EXCLUSION — see Lesson 18: excluding those
  files HID a real failing error; scan them, fix at source or keep as documented warnings instead.)**
  (2) `obsidianmd/no-static-styles-assignment` flags only **static LITERAL** values
  (`el.style.x = "0"`, `setProperty("--v", "auto")`) — DYNAMIC values (`= t.transform`, `` =
  `${px}px` ``, a non-`--` var) are NOT flagged, and `setProperty` with a string LITERAL still is even
  for a `--` custom prop. So move static literals to `styles.css` and keep per-image dynamic values
  inline (or behind a marker class); don't churn the dynamic assignments.
- **Lesson 18 — A recreated external review must SCAN everything the bot scans and MATCH its
  severities; excluding files (or guessing what the bot won't flag) hides REAL failing errors**
  (surfaced by `review-0.6.1.md`, the re-review of the v0.6.1 compliance pass). v0.6.1 EXCLUDED the
  standalone runtime + dev-bridge from `lint:obsidian` and turned `prefer-active-doc` off "to mirror
  what the bot enforces" — but the bot scans the **whole repo**, so the runtime's `createElement(
  "style")` kept **failing the real review** while our local gate stayed green. Two corrections:
  (1) **scope** — recreate over ALL of `src/**`, exactly like the bot; a non-plugin file's genuine
  flag is either FIXED at the source (the runtime's `<style>` → `adoptedStyleSheets`, which is also
  the rule-clean way to inject CSS on a foreign page) or KEPT as a documented warning, never hidden by
  an `ignores`. (2) **severity** — the recommended ruleset is STRICTER than the bot (it makes
  `import/no-nodejs-modules`, `prefer-instanceof`, `no-console` hard errors); the bot shows them as
  warnings. Set those to `warn` so the gate's ERROR set equals the bot's — "0 errors locally" then
  genuinely means "the review won't fail." _Corollary:_ "documented as a false positive" is NOT a fix
  if the bot still errors on it — only fixing the source, or proving the bot reports it as a warning,
  clears the review. (Decision 29 / Change 37.)

---

## SOLVED / DONE:  Bugs, Features & Decisions → CHANGELOG.md

The resolved **Bug**, **Feature** and **Decision** entries (each with its cause + fix) now live in
[`CHANGELOG.md`](../../CHANGELOG.md) — numbered per category and split across the version each
shipped in. Only the **OPEN** items (top) and the **Meta level** (verifications, refactoring,
housekeeping, lessons) remain in this file.
