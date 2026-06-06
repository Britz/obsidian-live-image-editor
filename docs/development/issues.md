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
>    (**Lesson 1–16**), each a bug-class + the rule that prevents it. All unnumbered.
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

- [ ] **Decision 13 — Display-mode residual (AD3, minor).** The uniform box computes to `display:block` on a plain
      page vs `inline-block` where an alignment class is present — harmless given the explicit px
      width, but a residual special case worth tidying.
- [ ] **Decision 14 — Enter=accept is captured globally while a panel is open (verify it doesn't surprise).** The
      shared host captures Enter→accept (and Esc→cancel) on `document` while open, so an Enter pressed
      with focus back in the editor accepts-and-closes rather than inserting a newline. This matches
      the active-region/modal-ish model (the panel is the focus while open) and pairs Enter with ✓,
      but revisit if it ever feels wrong — e.g. scope the capture to focus within the panel/region.
      (Submodal accept/cancel rework, 2026-06-05.)
- [ ] **Decision 15 — F14 lists Export among the shared-host panels, but Export uses the native save dialog.** Crop,
      Filters and Resize go through `AnchoredSubmenu`; Export is a one-shot native dialog
      (`export.ts`, AD9/F13), never a live-preview panel. Pre-existing wording, surfaced while
      pulling F14 to IST for the accept/cancel rework — decide whether to reword F14 ("…and Export"
      → "Export uses the native dialog") or leave it as the conceptual grouping.
- [ ] **Decision 16 — `data-`-prefix the runtime-only keys on WRITE? (cross-renderer HTML5-validity).** The writer
      emits bare `rotate=` / `flip=` / `transform=` / `filter=`; in foreign output these land verbatim as
      non-standard `rotate="…"` attributes (python-markdown — browser-inert but not valid HTML5) or as
      `data-rotate="…"` (Pandoc prepends `data-` → valid HTML5). The runtime already READS both
      spellings (`runtime.ts` claim selector), so writing the `data-` prefix ourselves would make the
      no-plugin output valid HTML5 everywhere — at the cost of a longer hand-edited block (T11
      brevity). Current lean: **keep bare keys** (already browser-inert and shorter); revisit only if
      HTML5 validity of the _exported_ page matters. Surfaced by the cross-renderer fallback research
      (2026-06-04) — see implementation-plan §2.2b + memory `img-attr-fallback-prior-art`.
- [ ] **Decision 17 — D7 — the filter panel docks ALWAYS to the right, not "the side with more room".** The shared
      host supports flipping to the left when it would overflow (`allowFlip` defaults `true`,
      `anchored-submenu-logic.ts`), but the filter panel passes `allowFlip:false`
      ([filter-panel.ts:92](src/filter-panel.ts#L92)) — a DELIBERATE Bug-56 trade-off ("never flip onto
      the file explorer"). So D7's "beside the image, on whichever side has more room" is knowingly not
      met. Decide: reword D7 to "docks beside, clamped to the right (Bug 64)" or re-enable a guarded
      flip. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **Decision 18 — T2.3 says "never width+height together", but the custom-size path emits both.**
      `serializeTransform` writes a bare `width=N` AND a `style="height:…"` when the user sets both via
      the resize modal (D6.1) ([transforms.ts:220-225](src/transforms.ts#L220)). D6.1/F24 deliberately
      allow an explicit W+H, so T2.3's blanket "never together" contradicts them. Decide: precise the
      T2.3 wording (W+H allowed for the explicit custom-size case; presets/auto never co-emit) vs.
      enforce a single axis. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **Decision 19 — `reset()` does not `unwrapBox` — the empty 3-layer box stays (verify it's intended).**
      `reset()` ([main.ts:680](src/main.ts#L680)) writes the empty transform and re-renders via
      `buildLayers(empty)` but never calls `unwrapBox`, so the wrapper layers remain (rendering the
      uniform R0 box with no transform). Almost certainly intended (R0 renders every image through the
      box), but unlike `clearStaleTransform` ([main.ts:335](src/main.ts#L335)) it leaves the chrome in
      place — confirm or unwrap. (Clean-room analysis reconcile, 2026-06-05.)

_Under-specified specs — decide the wording / behaviour (also Decision):_

- [ ] **Decision 20 — Shared sub-menu host component API** (D6 / F14).
- [ ] **Decision 21 — Link-form conversion edge cases** (F5 / F6).
- [ ] **Decision 22 — F7 activation scope — a Reading-view click opens no toolbar** (only the source/LP editor click
      or a touch long-press does). The click handler is scoped to `.markdown-source-view`; a plain
      Reading-view click never opens the toolbar (editing needs the editor). Likely intended — pin it
      down in F7 so it isn't read as a gap. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **Decision 23 — Filter histogram samples the ORIGINAL image, not the filtered result** (`filter-panel.ts` reads
      the source `getImageData`). Reasonable as a fixed reference, but unspecified — state whether the
      histogram should track the live filter or stay the original. (Clean-room analysis reconcile,
      2026-06-05.)

### Planned features (Feature)

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

### Known open bugs (Bug)

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
- [ ] **Bug 66 — crop resize handles are hardcoded white (`#fff`), invisible in light mode.** The crop
      editor's handle chrome — the frame border (`.lie-crop-handles`, `border: 2px solid #fff`), the
      corner/edge handle squares (`.lie-crop-handle`, `background: #fff`) and the rotate knob
      (`.lie-crop-rotation-handle` + its stem) — is all hardcoded `#fff`
      ([styles.css:408-454](styles.css#L408-L454)). On a dark theme this happens to read fine (white on
      a dark surround); in **light mode** the white handles vanish against the light image/page. _Fix:_
      recolour them with an Obsidian theme variable that **adapts to the active theme** — an
      **action/accent** colour such as `var(--interactive-accent)` — and keep them **distinct from the
      outer native resize handle** (`.lie-box .image-resize-corner`, which mimics Obsidian's native
      accent handle, [styles.css:285-317](styles.css#L285-L317)) so the two read as different tools (the
      native handle resizes the whole image; the crop handles scale/crop _within_ the frame). The handle
      shapes already differ, but a different colour makes that unmistakable. _Nice-to-have:_ render the
      **frame border dotted or dashed** (not solid) to signal the meta-resize layer it operates on.
      Reported 2026-06-05 (user; dark-mode masked it the night before).
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

_(Bugs 68–72 — the community-directory should-fix items — are RESOLVED in v0.4.2; see Change 25 in
the changelog. The bugs that remain open: 65, 66, 67.)_

---

## Meta level

Process & quality work — stays in `issues.md`, **not** numbered into the changelog sequences.

### Verifications (need eyes on a real / focused window)

- [ ] **Reading-view-specific render + native save dialog — focused-window pass.** The interactive
      panels (crop / filter / size) and the **F2 duplicate-resolution render path** are now verified
      live in a focused window (`verify-render-gaps` 4/4 incl. the occurrence-aware F2 checks;
      `verify-crop` 20/20; `verify-write-path` 14/14 incl. the Bug-48 dup rows). What still needs a
      focused **reading-view** pass (it doesn't render in a backgrounded/headless window) is the
      reading-view-SPECIFIC rendering — captions on a real captioned image and float/inline THERE — and
      the **native save dialog** (F13, not CDP-reachable). The pure logic each depends on is unit-tested.
- [ ] **Crop responsive scaling (Decision 2).** Box-relative `translate%` + `width:100%` img should rescale a
      crop as the column narrows; structurally correct but not yet measured under a narrowing column.
- [ ] **Crop drag haptics / pinch-sensitivity feel.** The drag/zoom feel of the in-place crop editor —
      the one remaining MANUAL focused-window check (not CDP-synthesizable).
- [ ] **Submodal + active-region + Bugs 62–64 — real-`:hover` travel only (structural part DONE).**
      The structural guards now actually RUN green live (2026-06-05 re-check, fresh build):
      `verify-submodal-icons` 16/16, `verify-submodal-region` 12/12, `verify-region-clickaway` 14/14
      (incl. the click-away-boundary follow-up: clicking the IMAGE closes+persists filter/size),
      `verify-popup-region` 8/8 (read-source-back + synthetic enter/leave). What's left is the ONE
      thing CDP can't synthesize — the **real-pointer `:hover` CSS travel** and the visual feel:
      (a) the **floating** bar (outside the image rect) — hover image→bar→panel/popup and back must
      stay one region with no flicker; (b) the in-chrome bar stays **greyed the whole time** a panel is
      open (no one-frame un-greyed flash on re-entry); (c) ✓/✗ feel right. (Click-away leaving crop
      open, group-popup coupling, and the greyed-hidden states are now structurally proven, not just
      claimed — Lesson 16.)
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
      `tests/runtime-smoke.html` is a manual fixture. So the two least-covered paths are (a) the **portable
      runtime** — foreign-page hydration via `buildLayers`/`readTransform`, the runtime-only keys
      degrading to the original image; and (b) the **export canvas render** (`renderTransformedImage` —
      replay box geometry + native filter at original resolution). _Add:_ a headless-browser check that
      hydrates `tests/runtime-smoke.html` and asserts the built 3-layer structure + applied transform (CI-able,
      no Obsidian), and an export-render guard that drives `renderTransformedImage` and reads the output
      canvas back (the save DIALOG stays manual, F13).

### Refactoring (deferred — a mix of verify & change)

_These date from the 2026-06-05 DRY/KISS analysis — re-validate that each still applies before acting;
when one is actually carried out it ships as a **Change** in the changelog._

- [ ] **Smaller chrome unification** — the resize handle, the anchored sub-menu and the filter-panel
      docking could all anchor to the uniform box through one mechanism. _(Crop-in-place and the
      portable runtime + bare-key format are DONE — see the changelog.)_
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

### Hard-won lessons (Lesson 1–16) — must never be re-broken

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
  `CDP_PORT=9223` until it recovers. (c) **Reading view does not render headless** — Obsidian's
  reading-view renderer is visibility-driven; a backgrounded/headless window leaves
  `.markdown-preview-sizer` empty, so verify that path in a focused window. (See CLAUDE.md → Live
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

---

## SOLVED / DONE:  Bugs, Features & Decisions → CHANGELOG.md

The resolved **Bug**, **Feature** and **Decision** entries (each with its cause + fix) now live in
[`CHANGELOG.md`](../../CHANGELOG.md) — numbered per category and split across the version each
shipped in. Only the **OPEN** items (top) and the **Meta level** (verifications, refactoring,
housekeeping, lessons) remain in this file.
