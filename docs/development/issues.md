# Open Items & Registry — Live Image Editor

> The single backlog + registry for the plugin, in two parts:
>
> 1. **OPEN — checklist at the top.** Everything still to do, as `- [ ]` items grouped by kind
>    (open decisions, verifications, deferred ideas, DRY/KISS, known open bugs, housekeeping). Tick
>    them off as they land. Items marked **(verify)** could not be confirmed from code/commits and
>    need a check. The **[Release-Requirement]**-tagged items are the community-directory submission
>    gate (the former standalone `RC1–RC11`), each **sorted into its task-type section** with its
>    `RC#` kept inline. The full pass/fail audit record (rules `R1–R30`, with sources) and the manual
>    submission checklist live in the top-level [README → Release compliance](https://github.com/Britz/obsidian-live-image-editor/blob/main/README.md#release-compliance);
>    the open `R…` rules there link back to these sections.
> 2. **SOLVED / DONE — registry at the bottom.** Everything already resolved, kept on purpose with
>    its **cause + fix** so the same mistake is not made twice. The hard-won lessons (**Lesson 1–16**),
>    decisions (**Decision 1–10**), features (**Feature 1–21**) and the bugs (**one flat global
>    sequence, Bug 1–64**) are referenced by the other docs, so the numbers must keep resolving to
>    content here. Registry entries carry no `[x]` (they are done by definition); `[ ]`/`[x]` checkboxes
>    live only in **OPEN**.
>
> **Numbering policy — own number, own bug.** Each distinct defect gets its **own** number; numbers are
> never reused. A recurring symptom with a **different cause** is a NEW bug with a NEW number — not a
> reopen of the old one (e.g. the ancient resolved Bug 1/2 and the later region bugs are separate
> entries, same for Lessons / Decisions / Features).
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
      HTML5 validity of the _exported_ page matters. Surfaced by the cross-renderer fallback research
      (2026-06-04) — see implementation-plan §2.2b + memory `img-attr-fallback-prior-art`.
- [ ] **D7 — the filter panel docks ALWAYS to the right, not "the side with more room".** The shared
      host supports flipping to the left when it would overflow (`allowFlip` defaults `true`,
      `anchored-submenu-logic.ts`), but the filter panel passes `allowFlip:false`
      ([filter-panel.ts:92](src/filter-panel.ts#L92)) — a DELIBERATE Bug-56 trade-off ("never flip onto
      the file explorer"). So D7's "beside the image, on whichever side has more room" is knowingly not
      met. Decide: reword D7 to "docks beside, clamped to the right (Bug 56)" or re-enable a guarded
      flip. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **T2.3 says "never width+height together", but the custom-size path emits both.**
      `serializeTransform` writes a bare `width=N` AND a `style="height:…"` when the user sets both via
      the resize modal (D6.1) ([transforms.ts:220-225](src/transforms.ts#L220)). D6.1/F24 deliberately
      allow an explicit W+H, so T2.3's blanket "never together" contradicts them. Decide: precise the
      T2.3 wording (W+H allowed for the explicit custom-size case; presets/auto never co-emit) vs.
      enforce a single axis. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **`reset()` does not `unwrapBox` — the empty 3-layer box stays (verify it's intended).**
      `reset()` ([main.ts:680](src/main.ts#L680)) writes the empty transform and re-renders via
      `buildLayers(empty)` but never calls `unwrapBox`, so the wrapper layers remain (rendering the
      uniform R0 box with no transform). Almost certainly intended (R0 renders every image through the
      box), but unlike `clearStaleTransform` ([main.ts:335](src/main.ts#L335)) it leaves the chrome in
      place — confirm or unwrap. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **[Release-Requirement]** **Reconcile `isDesktopOnly: false` with the Electron/Node usage (RC2;
      P1 community-directory blocker).** Submission rule: _"If your plugin uses any of these
      [Node.js/Electron] APIs, you must set `isDesktopOnly` to `true`."_ Manifest says `false`
      ([manifest.json](manifest.json)), but the code uses Electron/Node:
      `require("@electron/remote"/"electron")` + `require("fs"/"path")` ([export.ts:172](src/export.ts#L172),
      [export.ts:204-205](src/export.ts#L204)) and `require("@electron/remote"/"electron")` for the rotate
      gesture ([crop-editor.ts:539](src/crop-editor.ts#L539)). The access is **dynamic + feature-detected**
      (`(window as any).require` + try/catch + mobile fallbacks: export → `adapter.writeBinary` + modal;
      rotate → handle), so the plugin genuinely runs on mobile and the static-analysis bot likely won't
      flag it (no static node imports outside the tree-shaken `dev-bridge.ts`). A **human reviewer** will
      still question it. **Fix (decide):** keep `false` (mobile works) **and** document the graceful
      degradation in the code comment / README; OR if any path actually breaks on mobile, flip to `true`.
      Do not leave it undocumented.

### Verifications (need eyes on a real / focused window)

- [ ] **Reading-view-specific render + native save dialog — focused-window pass.** The interactive
      panels (crop / filter / size) and the **F2 duplicate-resolution render path** are now verified
      live in a focused window (`verify-render-gaps` 4/4 incl. the occurrence-aware F2 checks;
      `verify-crop` 20/20; `verify-write-path` 14/14 incl. the Bug-48 dup rows). What still needs a
      focused **reading-view** pass (it doesn't render in a backgrounded/headless window) is the
      reading-view-SPECIFIC rendering — captions on a real captioned image and float/inline THERE — and
      the **native save dialog** (F13, not CDP-reachable). The pure logic each depends on is unit-tested.
- [ ] **Crop responsive scaling (Decision 7).** Box-relative `translate%` + `width:100%` img should rescale a
      crop as the column narrows; structurally correct but not yet measured under a narrowing column.
- [ ] **Crop drag haptics / pinch-sensitivity feel.** The drag/zoom feel of the in-place crop editor —
      the one remaining MANUAL focused-window check (not CDP-synthesizable).
- [ ] **Submodal + active-region + Bugs 54–56 — real-`:hover` travel only (structural part DONE).**
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
- [ ] **[Release-Requirement]** **Verify teardown of direct `document`/`window` listeners — or switch to
      `registerDomEvent` (RC11; P3 community-directory polish).** Guideline: resources must be released on
      unload. Several listeners bypass `registerDomEvent`: [main.ts:860](src/main.ts#L860),
      [crop-editor.ts:348-351](src/crop-editor.ts#L348), [live-preview.ts:243-244](src/live-preview.ts#L243),
      [region-hover.ts:37-38](src/region-hover.ts#L37). Each has its own teardown (`removeListener`/`detach`),
      so these are not confirmed leaks — but they sidestep Obsidian's auto-cleanup. **Fix:** confirm every
      path detaches, or move plugin-lifetime listeners onto `registerDomEvent`.

### Known open bugs

- [ ] **Bug 57 — `<>` dismiss doesn't hide the FRONT of the link on the cursor line (fights the
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

- [ ] **Bug 58 — crop resize handles are hardcoded white (`#fff`), invisible in light mode.** The crop
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

- [ ] **Bug 59 — toggling Obsidian's line-break mode makes FLOATED images vanish in Live Preview
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

- [ ] **[Release-Requirement] Bug 60 — plugin-name top-level heading in settings violates the directory
      guideline (RC3; P2 community-directory should-fix).** Guideline: _"Avoid adding a top-level heading …
      such as 'General', 'Settings', or the name of your plugin."_ [settings.ts:51](src/settings.ts#L51)
      renders `createEl("h2", { text: t("settingsTitle") })` with `settingsTitle: "Live Image Editor"`
      ([en.ts:52](src/i18n/en.ts#L52)). **Fix:** delete that line (and the now-unused `settingsTitle` key
      in `en.ts` / `de.ts`).
- [ ] **[Release-Requirement] Bug 61 — raw HTML headings instead of `setHeading()` (RC4; P2
      community-directory should-fix).** Guideline: _"Employ `setHeading()` instead of HTML heading
      elements."_ All section headings use `createEl("h3", …)`: [settings.ts:85](src/settings.ts#L85),
      [settings.ts:101](src/settings.ts#L101), [settings.ts:161](src/settings.ts#L161) (plus the h2 in
      Bug 60). **Fix:** replace each with `new Setting(containerEl).setName(...).setHeading()`.
- [ ] **[Release-Requirement] Bug 62 — command names are Title Case and bypass i18n (RC5; P2
      community-directory should-fix).** Guideline: _"Sentence case … only the first word and proper nouns
      capitalized."_ The size/align commands are hardcoded Title Case and bypass i18n: `"Size: Small"` …
      `"Align: Center"` ([commands.ts:33-38](src/commands.ts#L33-L38)). **Fix:** `"Size: small"`,
      `"Align: left"`, etc., and move the strings into `en.ts`/`de.ts` like the rest.
- [ ] **[Release-Requirement] Bug 63 — remaining UI headings are Title Case (RC6; P2 community-directory
      should-fix).** [en.ts:62](src/i18n/en.ts#L62) `"CSS Snippets"` → `"CSS snippets"`;
      [en.ts:73](src/i18n/en.ts#L73) `"Editing Toolbar Integration"` → `"Editing toolbar integration"`.
      Mirror the same change in `de.ts`.
- [ ] **[Release-Requirement] Bug 64 — user-defined / constructed paths not run through `normalizePath()`
      (RC7; P2 community-directory should-fix).** Guideline: _"Use `normalizePath()` whenever you accept
      user-defined paths … or construct your own paths."_ grep `normalizePath` → 0 hits. Affected: the
      editable vault path in the export fallback modal ([export.ts:221-223](src/export.ts#L221)) and
      constructed snippet paths in [snippet-scanner.ts:71-89](src/snippet-scanner.ts#L71). **Fix:** wrap
      those paths in `normalizePath()`.

### Deferred design / elegance (DEFER)

- [ ] **Smaller chrome unification** — the resize handle, the anchored sub-menu and the filter-panel
      docking could all anchor to the uniform box through one mechanism. _(Crop-in-place and the
      portable runtime + bare-key format are DONE — see the registry.)_
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

### Planned features (need a requirements → architecture pass first)

New capabilities, not yet F-items. Per `methodology.md` each starts at the top (a Functional/Design
requirement + the storage/permission implications) before any code.

- [ ] **Settings-panel rework.** Restructure / redesign the settings tab (`settings.ts`, AB19) —
      grouping, clarity, and room for the new toggles below. Surfaced as its own UX pass, not a
      one-off addition.
- [ ] **Editing-toolbar integration — adapt & test (F23 / T10).** Revisit the integration with the
      _editing-toolbar_ community plugin: re-check the version gate, the button (un)registration, and
      actually test it against current versions of that plugin. Off by default; currently the
      least-exercised path.
- [ ] **"Flatten & clean" a page / vault — IN PLACE (destructive, on the live vault).** A command
      that, for the selected note (or the whole vault): **exports every edited image** to a real file
      with the transforms baked in (F13 export, batched), **renames** so the baked file takes the
      **original's name** (the untouched original kept/renamed alongside), and **strips the `{…}`
      blocks** from the Markdown — turning the non-destructive edits into permanent files. _Decisions
      to make first:_ what happens to the original (keep as `…-original`? move to a folder?), conflict
      / collision handling, undo/confirmation (this rewrites real files), and which transforms bake
      vs. stay (e.g. `align`/`width` are already faithful — do they bake or remain attributes?).
- [ ] **"Export" a page / vault — as a DOWNLOAD (non-destructive, off the live vault).** The same
      flatten-and-clean as above, but it produces a **separate downloadable copy** (a bundle of the
      baked images + the cleaned Markdown) and leaves the live vault **untouched**. Effectively the
      publish path: a portable, plugin-free copy of the notes. _Shares_ the export + clean machinery
      with the in-place flatten; the only difference is target (a download bundle vs. the live files).
- [ ] **Reveal-source setting — ONE combined dropdown (F8 / F20).** Merge the existing _Always show
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

- [ ] **Ship the user's MODIFIED in-vault snippets with the runtime (not just the default stack).**
      The standalone runtime now injects the plugin's DEFAULT decoration snippet (F16.1 —
      `rounded/shadow/bordered/circle`) so a foreign page renders class-styled images like Obsidian
      (`src/bundled-snippet.ts`, the single source shared by plugin + runtime). Open extension: carry
      the user's ACTUAL, possibly-edited snippet CSS (and the other image snippets they have enabled)
      into the exported/published runtime, so a vault with customized classes renders faithfully
      off-Obsidian. _Decisions first:_ which snippets travel (only ones `lie` images apply? all enabled
      image snippets?), how they travel (baked into a per-site CSS at export vs. a runtime config),
      Obsidian theme-var dependencies (`var(--background-modifier-border)` & friends don't resolve
      off-Obsidian), and scoping/collision with the host site's own CSS.

### Under-specified details (SPEC)

- [ ] Shared **sub-menu host** component API (D6 / F14).
- [ ] **Link-form conversion** edge cases (F5 / F6).
- [ ] **F7 activation scope — a Reading-view click opens no toolbar** (only the source/LP editor click
      or a touch long-press does). The click handler is scoped to `.markdown-source-view`; a plain
      Reading-view click never opens the toolbar (editing needs the editor). Likely intended — pin it
      down in F7 so it isn't read as a gap. (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **Filter histogram samples the ORIGINAL image, not the filtered result** (`filter-panel.ts` reads
      the source `getImageData`). Reasonable as a fixed reference, but unspecified — state whether the
      histogram should track the live filter or stay the original. (Clean-room analysis reconcile,
      2026-06-05.)

### Housekeeping (CHORE)

- [ ] **Harden the CDP guard suite for reliable BATCH runs (Lesson 16).** Each `tests/cdp/verify-*.mjs` passes
      individually on a fresh build, but running the whole set back-to-back degrades the live window
      (render churn over many fixture create/modify/delete cycles + reloads) → spurious flakes: transient
      single-image fixtures fail to render their overlay (crop/size steps then `cropOpened:false`), and
      the 9222 relay buffers the RUN-eval-then-poll → "RUN eval did not finish". _Add:_ re-find live
      elements right before each action (never a stale captured ref), a retry-on-churn wrapper, and a
      `run-all` harness that reloads to a clean state between guards and prefers `CDP_PORT=9223` direct.
      The symptom is recorded in Lesson 16; this is the fix.
- [ ] **Finish the dead-code sweep — `getClassNames` / `getAvailableClasses` (`styles-injector.ts`).**
      The 2026-06-05 sweep removed `getPreset` / `setPresetWidth` / `parseLocationTransform` but MISSED
      this pair — both have zero callers in `src/` and `tests/`
      ([styles-injector.ts:86](src/styles-injector.ts#L86)). Clean removal (no behaviour change).
      (Clean-room analysis reconcile, 2026-06-05.)
- [ ] **[Release-Requirement]** **Disclose out-of-vault file writes in the README (RC1; P1
      community-directory blocker).** Policy: _"Accessing files outside of Obsidian vaults"_ requires an
      explicit README explanation. The export's native save dialog writes to **any user-chosen path outside
      the vault** via Electron `fs.writeFileSync` ([export.ts:213](src/export.ts#L213); dialog
      [export.ts:172-216](src/export.ts#L172)). `README.md` does not mention file-system / Electron access
      (grep `electron|outside vault|file system` → 0 hits). **Fix:** add a short "File system access" note
      to the README — the native save dialog can write the exported image to a location of the user's
      choice, including outside the vault.
- [ ] **[Release-Requirement]** **Manifest description — drop the em-dash; consider an action-verb opener
      (RC8; P3 community-directory polish).** Submission style: _"Avoid using emoji or special characters"_
      and _"Start with action statements."_ Current ([manifest.json](manifest.json)) is 128/250 chars, ends
      with a period, no "This is a plugin" — but opens as a noun phrase and contains an em-dash (`—`).
      **Suggested:** `"Edit images non-destructively: crop, rotate, flip, resize, and apply CSS filters live, without modifying the original file."`
- [ ] **[Release-Requirement]** **Move static inline styles to CSS classes (RC9; P3 community-directory
      polish).** Guideline: _"No hardcoded styling."_ Most of the 96 `.style.` writes are **dynamic
      geometry** (crop maths, menu positioning) and are acceptable. The **static** ones should be
      classes/variables — e.g. [settings.ts:177](src/settings.ts#L177) `warn.style.color = "var(--text-error)"`.
      **Fix:** audit the static cases and replace with a class in `styles.css`; leave runtime-computed
      geometry as-is.
- [ ] **[Release-Requirement]** **Prefer the Vault API over the Adapter API where a vault `TFile` exists
      (RC10; P3 community-directory polish).** Guideline prefers `Vault.*` (caching / race-safety).
      [export.ts:162](src/export.ts#L162) `vault.adapter.exists(candidate)` on a vault path →
      `vault.getAbstractFileByPath()`. The `configDir/snippets` adapter calls in
      [snippet-scanner.ts:43-89](src/snippet-scanner.ts#L43) are unavoidable (config-dir files are not vault
      `TFile`s) — leave those.

---

## SOLVED / DONE

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
  braces before parsing; regression test in `tests/unit/live-preview.test.ts`. (Was the root cause of Bug 16.)
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
  native edit-block-button is hidden unconditionally (the `<>` icon otherwise leaks, Bug 23). The
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

### Resolved decisions (Decision 1–11)

- **Decision 1 — Reveal/edit model — overlay + CSS reveal + native edit (landed at HEAD).** Supersedes the
  earlier "native path CLOSED → self-built field" conclusion. The LP adapter **does not replace**
  the line (AD5): Obsidian renders its own (CSS-suppressed) native embed and provides the
  cursor-reveal; the plugin overlays its own image. Reveal-for-looking (F8) is a display-only fake
  raw link + the `{…}`, with **two natural modes** — `auto` (reveal on cm-line hover or the active
  line) and `always` (reveal everywhere) — from the global default-state setting `alwaysShowLink`
  (AB19/F20), plus a **`<>` toggle that transiently DISMISSES** this image's source
  (`lie-dismissed`, not persisted per image; auto-clears in auto mode). There is no third "hidden"
  reveal mode and no `cycleRevealMode` cycling (code: `src/live-preview.ts`). Editing (F9) is
  Obsidian's native cursor-reveal of the source as real document text (works standalone + inline).
  `{…}` (F3) is hidden by CSS when rendered, shown on the active line. _(Fully declarative in CSS —
  the fake link yields to the native source via `.cm-line:has(> .cm-formatting)`; the dismiss
  refinement is recorded under Feature 12 above.)_
- **Decision 2 — Temperature — RETIRED (F11).** The virtual-temperature control (`temperatureAdjust`, never
  wired to a panel row after the rework) was decided dead and removed in the finalization pass
  (2026-06-05) — see Feature 17 below. F11 keeps the seven sliders +
  named presets; the function, its test, the `temperature` i18n key and the stale panel comments
  are gone, and `requirements.md` F11 / `architecture.md` AB13 no longer mention temperature.
- **Decision 3 — Export resolution (F13 / AB15 / §3.4).** Export from the original image's native resolution
  (highest quality; display size never reduces it).
- **Decision 4 — Inline ≠ size; uniform chrome.** Inline (flows in text) and size (a preset) are orthogonal;
  no "chrome skipped for inline" special case — every image treated the same (R0). → folded into
  F17/F24/AB9/§3.3.
- **Decision 5 — Routing rule.** Image = box; everything goes to the box except `transform` and `filter`
  (→ image). Unexpected style property → box. Classes: marker on the image; alignment/inline →
  the embed. → §2.3 routing + AD2.
- **Decision 6 — Snippets (F16 / F16.1).** Install copies shipped CSS into the snippets folder without
  force-overwrite (a restore of deleted files; same-named file left as-is). Reset is per-file to
  the shipped original (diff-detected). Plus: hide the add-class dropdown when no snippets apply;
  only scan/offer snippets enabled in Obsidian. → F16/F16.1/AB4/§3.1.
- **Decision 7 — Crop pixel-quantization (F12).** Cut quantizes to whole pixels + fixed angle steps live
  during the interaction (present). Responsive box-relative scaling is the open VERIFY above.
- **Decision 8 — Floating toolbar and in-image toolbar are NOT a duplicate (do NOT chase).** Both
  build via `buildToolbarElement`; only host + positioning differ (intended, D1/D1.1).
- **Decision 9 — `RevealMode = "auto" | "always"` is NOT a retired mode cycle (do NOT chase).** The
  two values derive from the global default-state setting (`alwaysShowLink`); the `<>` dismiss is a
  SEPARATE per-line override (a `lie-dismissed` line decoration, auto-clearing in auto mode).
  `cycleRevealMode` is gone.
- **Decision 10 — Keep the `*-logic.ts` split (KISS analysis).** The pure `*-logic.ts` units stay
  split from their framework-coupled counterparts (AD7/T8/Lesson 6): the logic is unit-testable without an
  obsidian/CM mock (the repo has **no vitest config and no mock**, by design). `renderer-logic.ts` is
  a genuine shared unit (consumed by `render-core`, `live-preview`, `export`). Merging any of the
  others would only save a file while forcing a test to import obsidian/CM — the exact cost the split
  exists to avoid. The same discipline keeps `image-resolver.ts` pure (`import type` Editor) so its
  resolvers are unit-tested. **Recommendation: keep the split.**

- **Decision 11 — Docs-site stack: ProperDocs + MaterialX, single-version, native version badge (2026-06-05).**
  The docs site (`mkdocs.yml`, `.github/workflows/docs.yml`, `.github/requirements-docs.txt`) runs on
  **ProperDocs** — the maintained MkDocs 1.x drop-in fork (by a former MkDocs maintainer) — with the
  **MaterialX** theme (the community continuation of mkdocs-material). _Why:_ the original MkDocs is
  abandoned and the incoming "MkDocs 2.0" drops plugin support / moves to TOML, breaking Material +
  every plugin; mkdocs-material itself went maintenance-only (feature-frozen Nov 2025, critical fixes
  ~until Nov 2026, team moving to Zensical). Build with **`properdocs`, not `mkdocs`**. _Versioning:_
  `mike` was **rejected** — it couples its version state to the `gh-pages` branch and shells out to the
  `mkdocs` binary (won't even use ProperDocs); we run a **single-version** site instead. The
  compiled-from release is shown by the **native header repository link** (latest GitHub Release tag,
  fetched live) — so **releases must be published** (a bare git tag won't show); no `mike`, no
  `versions.json`, no footer hook. _Deploy:_ **`properdocs gh-deploy` → `gh-pages` branch** (Pages
  "deploy from a branch"). Also considered + rejected: full `mike` multi-version, and staying on stock
  mkdocs-material (lower-risk today but EOL ~Nov 2026 → would migrate to Zensical regardless).

### Landed features & milestones (Feature 1–21)

- **Feature 1 — CLAUDE.md cleanup (2026-06-02).** Slimmed to a lean build/debug guide (Project, Build & Test,
  CDP) + a documentation map. The old duplicated requirements/architecture/known-bugs were removed.
- **Feature 2 — 2026-06-02 DRY/KISS audit points dissolved by the rework.**
  - **`export.ts canvasFilter` re-listing filter functions/units/defaults.** DISSOLVED — there is
      no `canvasFilter`; `export.ts renderTransformedImage` sets `ctx.filter = transform.filter`
      **verbatim** (`src/export.ts:60,82,98`), so the native filter string is the single source. No
      duplicate filter table in export.
  - **`export.ts` rotation branch recomputing the rotated bounding box.** DISSOLVED — already DRY:
      export **calls** `rotatedAabb(nw, nh, deg)` from `renderer-logic.ts` (`src/export.ts:79`); the
      old `rotatedBox` symbol no longer exists.
  - **"filter ≠ default" iterated _4×_ incl. `filterToVars`.** REDUCED, not gone — `filterToVars`
      and the whole `--lie-*` layer were removed, dropping it to **2** sites (`isDefaultFilter` /
      `filterToCss` guard) plus `filter-panel.ts currentFilter`. Carried forward as a smaller DRY item
      in the 2026-06-03 audit.
  - **Filter-panel slider row duplicated (temperature + normal).** DISSOLVED — the panel now has a
      single `buildSlider` driven by the `SLIDERS` array in a loop (`src/filter-panel.ts:162-189`) and
      **no separate temperature row** (the temperature control is currently absent — see Decision 2
      above). Nothing to merge.
  - **`caption.ts` rAF + `setTimeout` polling AND a `ResizeObserver` for the box width.** DISSOLVED
      — the rework's pure-CSS caption (`width:0; min-width:100%` inside `.lie-has-caption`) removed all
      JS width-sync; `caption.ts` / `caption-logic.ts` contain no `ResizeObserver`/`rAF`/`setTimeout`
      (verified). (→ AB7, the [0.3.0] rework milestone.)
  - **`addClass` "4th ad-hoc popup" to be merged with the group popup + anchored sub-menu.** Not
      pursued as a _pure_ refactor: `addClass`'s dropdown (`main.ts:741-766`), the toolbar
      `openGroupPopup` (`toolbar.ts:53-89`) and the modal `AnchoredSubmenu` are **three intentionally
      different interaction patterns** (run-and-close dropdown vs run-and-close palette vs
      commit/cancel modal). Unifying them is a **design** change (ties to D6/F14), not behaviour-
      preserving — moved to the Deferred design list, not the pure-refactor checklist.
- **Feature 3 — The rework — landed (2026-06-03).** The code matches `implementation-plan.md`'s target; the
  unit tests were rewritten for the new pure logic (97 passing). Vs the old model: - **Native CSS storage** — `transform`/`filter` stored verbatim in `style=` and routed to the
  img by property name; `--lie-*` props, `filterToVars`, `FILTER_VAR_NAMES`, the separate
  `CropData` type are **gone**. Crop is the same uniform geometry (explicit `translate()/scale()`
  in the img transform + a `width/height` cut frame). - **Declarative box→image sizing** — the box's `aspect-ratio` is derived from the intrinsic ratio
  (+ angle) via `renderer-logic.ts` (`boxAspectRatio`/`innerImageSize`) and applied as
  `--lie-auto-aspect`; the inner image sized in box-relative `%`. The JS measure-retry loop /
  rAF+setTimeout / `ResizeObserver` sizing is **removed** (intrinsic read once on load). - **Pure-CSS caption** — `width:0; min-width:100%` inside the shrink-wrapping host; the JS
  width-sync/poll/`ResizeObserver` is gone. - **LP overlay + native edit** — see Lesson 11/Lesson 12; reveal-for-looking is a display-only fake link
  keyed by static CSS (auto/always modes + the `<>` dismiss), with a global default-state
  setting. - **Export** reuses `renderer-logic` + the native `filter` string, renders at the original
  resolution; the duplicate crop/rotate math is gone. - **Size presets** (icon/small/medium/large/original) apply via re-themeable `--lie-size-*` vars;
  settings add preset widths, the default reveal state, and bundled snippet install/reset
  (opt-in). Snippet discovery scans only Obsidian-**enabled** snippets. - CDP-verified (Obsidian 1.12.7): declarative geometry holds (normal `300px`→box `300×200`;
  `rotate(90deg)` of a 1.5 landscape→box `200×300`, img `150%/66.67%`,
  `--lie-auto-aspect:0.667`; flip→box `120×180`) — all from the intrinsic ratio, no
  measure-then-resize. Crop is native + clipped (`overflow:hidden`, top-left origin +
  `translate()/scale()`).
- **Feature 4 — R0 + F22/D9 captions (CDP-verified).** One uniform box for every image (the `display:contents`
  "normal" special case removed); alt text → Markdown caption, centred, wraps within the image
  width, settings toggle, off by default.
- **Feature 5 — Box rename.** The uniform image box is now `.lie-image-area` (it handles the image) and the
  chrome container is `.lie-box` (the two swapped); `lie-rotate-box` / `ROTATE_BOX_CLASS` retired.
  Code: `renderer.ts` exports `BOX_CLASS = "lie-image-area"`.
- **Feature 6 — Native-look resize handle.** Restyled to match Obsidian's native image handle (rounded accent
  square, `--background-primary` fill + `--color-accent` outline), centred on the corner tip;
  padding-bottom + negative margin stops the block widget's `contain: paint` from clipping it.
  _(Note: the same `contain: paint` still clips the toolbar on small/inline images — see Known open
  bugs.)_
- **Feature 7 — 3-layer DOM + bare-key format (partial migration) — landed.** The plugin now builds the
  uniform **outer `.lie-image-area` → inner-frame `.lie-frame` → `<img>`** structure for every
  image (AD3), upgrading a reused legacy 2-layer DOM. The parser reads **both** the new bare keys
  (`rotate`/`flip`/`transform`/`filter`/`aspect-ratio`) **and** the legacy `style="transform: …"`
  (back-compat: an orientation-only legacy transform decomposes into the fields; a crop placement
  stays whole). The writer emits the new format. _Deferred (a later slice — out of this pass):_
  `width`/`height` still rode `style=` and `align` was still a `.lie-left/right/center` class — both
  since migrated to bare keys (see Feature 13).
- **Feature 8 — Crop serialization (SPEC) — SOLVED.** The crop now serializes as the bare keys
  `transform="<2D-affine placement>"` (on the `<img>`) + `aspect-ratio=<cut shape>` (on the outer,
  stored **only** when the cut shape ≠ the original ratio, AD6) + `width=` — and **never** a fixed
  px `height` (that distorts). `toCropResult` emits `{ transform, width, aspectRatio? }`; the
  renderer drives the crop footprint from the cut shape + angle via `--lie-auto-aspect` (so it
  swaps on a rotate), not from the natural image ratio. (Code: `crop-editor-logic.ts`;
  `renderer.ts` `cropAspect`/`shapeFrame`. Regression: `tests/unit/crop-editor-logic.test.ts`.)
- **Feature 9 — Crop-in-place editor — DONE** (see Bug 43).
- **Feature 10 — Crop teardown restores ALL transient overrides on EVERY exit — VERIFIED✓CDP.** _Concern:_ the
  old editor had two teardown paths (confirm vs cancel — the DRY audit's "double teardown"); if
  only one restored the lifted host `contain`, a confirmed crop would leave `contain:none` stuck
  and permanently break the LP block-widget paint-containment. _Verified:_ the auto-persist rework
  collapsed teardown into a SINGLE `exitCropMode` run from the one `onClose` that
  `AnchoredSubmenu.close()` fires on every exit (commit / Esc / click-away / dismiss / unload), so
  there is no second path. `tests/cdp/verify-crop-teardown.mjs` proves it structurally per exit path
  on a real `.lie-wrapper-block` host (pre-crop `contain:paint`): lifted to `none` during crop,
  and after EVERY exit the host `contain` reads back `paint` (the no-op path proves the
  paint→none→paint round-trip on the same un-rebuilt element), no `.lie-cropping`/inline `contain`
  leak, no orphan `.lie-crop-*` nodes, the image renders, no console error.
- **Feature 11 — Auto-persist for the shared sub-menu host (crop / filter / size) — DONE.** The host no longer
  has accept / cancel buttons (F14/D6/AD8 re-grounded): while a panel is open the working state is
  a LIVE DOM preview only (no source write); LEAVING it (close / Esc / click-away / dismiss /
  context loss) persists ONCE through the shared `isolateHistory.of("full")` writer = **one undo
  step** for the whole editing session. The only in-session revert is the per-panel **Reset**
  (Ctrl/Cmd-Z afterwards undoes the session). Esc now LEAVES-and-persists (it no longer discards);
  plugin unload is the one silent teardown (`close(false)`). (Code: `anchored-submenu.ts`
  `close(persist)` + no X/check in `buildHeader`; `filter-panel.ts`, `size`/`main.ts` openers
  drop `onCancel`; `crop-editor.ts` persists-or-clears on leave.)
- **Feature 12 — `<>` reveal toggle — RESOLVED into a transient "dismiss" (landed at HEAD).** The rework collapsed
  the reveal to **two natural modes** — `auto` (reveal on cm-line hover or the active line) and
  `always` (reveal everywhere) — driven by the global _Always show the link source_ setting
  (`alwaysShowLink`). The toolbar's `<>` icon is now a transient **dismiss toggle** that
  **dismisses** this image's source (fake link + `{…}`): a `lie-dismissed` LINE decoration that
  overrides the natural reveal. In **auto** mode it AUTO-CLEARS once the line is neither hovered
  nor the active line (so the next hover/edit reveals it again); in **always** mode it persists
  until toggled again or reload. There is **no** third "hidden" mode and **no** `cycleRevealMode`
  (the per-line reveal mode is gone). Code: `live-preview.ts` (`RevealMode = "auto"|"always"`,
  `DISMISSED_LINE`, `toggleReveal`/`setHover` effects); CSS: `lie-rev-auto|always` +
  `.lie-dismissed` (`styles.css:262-271`). (→ AD5/AB16.)
- **Feature 13 — width / align → bare keys (T2.3) — SOLVED✓CDP.** `align` is now a model FIELD serialized as
  `align=left|right|center` (a real HTML attr → faithful float/centre fallback); a px `width` is
  `width=N` (faithful), never with `height=` (distortion goes via `style=`). The parser still
  reads the legacy `.lie-left/right/center` classes and `style="width:…"` (back-compat — old
  notes render unchanged); the renderer re-derives the `lie-left/right/center` MARKER class on the
  img from the field so the `:has(img.lie-…)` float/centre rules still match. Size PRESETS are
  **baked** to a literal `width=N` px at click time (faithful, not setting-reactive — the user's
  chosen trade-off). CDP: new bare-key and legacy class/style forms render identically (left→
  float:left, center→text-align:center, both at the same width). (Code: `transforms.ts` `Align` + `align`; `render-core.ts` marker re-derive; `main.ts` `applyAlignment`/`applyPreset`;
  `size-submenu.ts` baked presets.)
- **Feature 14 — Obsidian-free render core extracted (AB7a) — SOLVED.** `renderer.ts` → `src/render-core.ts`,
  a framework-free module (imports only `transforms` + `renderer-logic`; NO obsidian/CM): the
  3-layer builder `buildLayers(img, transform)` (the plugin renderer and the runtime are two
  callers of it — DRY/R0), the identification (`CLAIM_SELECTOR` + `readTransform`), and the
  structural **`RENDER_CSS`** string. The LAYER CSS moved OUT of `styles.css` into `RENDER_CSS`,
  injected at runtime by BOTH the plugin (`styles-injector`) and the runtime — ONE source, so the
  render is identical (R0). `styles.css` keeps only the Obsidian embed integration + chrome.
- **Feature 15 — Standalone runtime bundle — SOLVED✓CDP.** `src/runtime.ts` → a SECOND esbuild entry →
  `lie-runtime.js` (framework-free IIFE, render CSS inlined → a single `<script>` include). On
  `DOMContentLoaded` (+ a `MutationObserver` for late content) it selects claimed imgs
  (`[rotate],[flip],[transform],[aspect-ratio],.lie` + the `data-`-prefixed Pandoc variants) and
  calls `buildLayers`, injecting `RENDER_CSS` + a runtime alignment rule (float/centre the outer,
  the flow participant on a foreign page). The runtime esbuild entry has NO `obsidian` external,
  so a stray framework import fails the build (verified: the bundle pulls zero obsidian/CM).
  Identification rule (verified in a real browser engine via an isolated iframe): a distinctive
  key OR `.lie` claims; `align`/`width`/`class` alone do NOT (faithful native fallback). Fidelity
  tiers (T3/F25) hold: with the runtime injectable, full fidelity; without it, `align`/`width`
  stay faithful and `rotate`/`flip`/`transform` degrade to the original image. `tests/runtime-smoke.html`
  is the manual/CI browser fixture. _(Limitation, documented + out of scope: kramdown/Jekyll never
  attach the bare-brace `{…}` to the DOM → unsupported there, the plain original shows.)_
- **Feature 16 — T3 (portable rendering) / F25 (never emit plugin-only Markdown) — fulfilled.** One bare-key
  format, three consumers (no-JS fallback, the runtime, the toolbar writer); the runtime-only
  keys degrade to the original image, the native-faithful keys survive everywhere.
- **Feature 17 — F11 temperature retired — DONE.** The virtual-temperature control had no production caller
  (the panel built no temperature row). Decided: retire it. Removed the dead `temperatureAdjust`
  (+ `clampNum`) and its tests, the `temperature` i18n key (en/de), and the stale filter-panel
  comments; struck temperature from `requirements.md` F11 and `architecture.md` AB13. (The rest of
  F11 — the seven sliders + presets — ships.) _(Supersedes the prior "wire it back or retire"
  decision item; see Decision 2.)_
- **Feature 18 — Dead-code sweep — DONE.** Removed `getPreset` / `setPresetWidth` (the retired re-themeable
  `var(--lie-size-*)` write-model — presets bake to `width=N` px; no `--lie-size-*` var is defined
  anywhere) and `parseLocationTransform` (zero callers), with their tests. `MARKER_CLASS` has no
  set path (was already dropped in aff1847); the parser **skip** of a legacy `.lie-img` is kept
  (back-compat) — verified, nothing to remove there.
- **Feature 19 — Pure DRY/KISS refactors — DONE** (all behaviour-preserving): the five panel openers funnel
  through one shared `locateActiveImage`; `nonDefaultFilter` is the single "≠ default" predicate
  (`filterToCss` / `isDefaultFilter` / the filter panel share it); `main.ts` uses `BOX_CLASS` not
  the `"lie-image-area"` literal; the labelled preset-button build is one `textButton` (`ui.ts`)
  across the filter / size / crop panels. (See the re-grounded DRY/KISS audit under OPEN for the
  two deferred items + the kept `*-logic` split.)
- **Feature 20 — (A) Restored accept (✓) + cancel (✗) icons — WITHOUT changing auto-persist-on-leave.** The
  header now carries **reset · cancel (✗) · accept (✓)**. While open it is a pure live-DOM
  preview (no source write); the **exit REASON** is routed through the pure
  `submenuExitEffect` (`anchored-submenu-logic.ts`): **commit** (✓ accept, Enter, click-away,
  dismiss, context loss) → `onCommit` = exactly one source write / one undo step (auto-persist,
  unchanged); **cancel** (✗, Esc) → `onCancel` = DISCARD, no write, the owner re-renders the
  live DOM from the unchanged source (crop re-renders from `existing`; size/filter from
  `location.params`); **silent** (plugin unload) → neither. Esc = cancel, **Enter = accept**
  (confirmed with the user). Per-panel Reset kept. Pinned: `submenuExitEffect` unit
  (tests/unit/anchored-submenu-logic.test.ts) + `tests/cdp/verify-submodal-icons.mjs` (read-source-back:
  ✓ writes the `{…}`, ✗ writes nothing AND restores the DOM, one undo step, leaving still
  persists). _Review follow-up:_ `writeToSource` (main.ts) now skips a byte-identical dispatch, so
  an UNCHANGED size/filter accept/leave adds no redundant undo step (was a self-replacing write;
  crop was already dirty-guarded) — one undo step per ACTUAL edit, uniformly.
- **Feature 21 — F8 / F20 default = auto (docs).** The requirement said the reveal defaults to _shown_; the
  code (and the model) default `alwaysShowLink` OFF = **auto** (reveal on hover / active line).
  requirements.md F8 + F20 aligned; the per-line `<>` dismiss is unchanged.

### Solved bugs (Bug 1–56)

- **Bug 1 — AUTO link reveal not shown on first render.** `autoGrow` ran while the textarea was
  `display:none` → height pinned to 0 → OBSOLETE — superseded by the overlay reveal model: no
  plugin-owned textarea; editing is native cursor-reveal, reveal-for-looking is static CSS.
  (SOLVED (n/a))
- **Bug 2 — Rotated reflow box mis-sized.** Competing async passes re-measured at different widths
  (the `693px` was an export-test artifact) → single render path (reconcile skips widget images,
  duplicate `ensureBox` removed) + ResizeObserver recompute; no fallback to the transient parent
  width. (SOLVED✓CDP)
- **Bug 3 — Filter panel mis-positioned / didn't track the image.** Left-flip + no scroll/hover
  handling → no left-flip (clamp right), hide when the image scrolls offscreen, visibility
  hover-bound to image+panel. (SOLVED✓CDP)
- **Bug 4 — Crop broke on image drag.** The crop frame ate the pointer events → frame
  `pointer-events:none`, handles re-enable it. (SOLVED✓CDP)
- **Bug 5 — `+`/`-` size buttons unwanted.** Removed from the toolbar (resize via native handle +
  custom-size). (SOLVED✓CDP)
- **Bug 6 — Toolbar icons not visually grouped.** No dividers → dividers between clusters
  (→ divider-wrapping). (SOLVED✓CDP)
- **Bug 7 — Filter-panel sliders overlapped.** Missing group spacing → `.lie-filter-group`
  spacing. (SOLVED✓CDP)
- **Bug 8 — Temperature slider didn't move itself.** Sliders matched by DOM index →
  `refreshSliders()` matches by `data-key`. (SOLVED✓CDP)
- **Bug 9 — Custom-size had no height field.** Added width + height entries side by side.
  (SOLVED✓CDP)
- **Bug 10 — Alignment (left/center/right) had no effect.** Float applied to the wrong element →
  `:has()` targets the embed container. (SOLVED✓CDP)
- **Bug 11 — Resize affordance missing.** Shown only on `:focus-within` → use Obsidian's native
  handle + frame, shown on toolbar hover, hidden in crop. (SOLVED✓CDP)
- **Bug 12 — Export failed when the target file existed.** Overwrite collision → superseded by the
  F13 save dialog (never overwrites silently). (SOLVED)
- **Bug 13 — Revealed link editor had a frame.** Inherited input styling → OBSOLETE — superseded
  by the overlay reveal model: no plugin-owned revealed-link editor; editing is native document
  text. (SOLVED (n/a))
- **Bug 14 — Image wider than the canvas when no size set.** `width: max-content` on
  `.image-wrapper` → drop it; rely on native `div.image-embed { width: fit-content }`. (SOLVED✓CDP)
- **Bug 15 — Resize frame offset from the image.** `.image-wrapper` padding → zero the padding so
  `inset:0` hugs the image. (SOLVED✓CDP)
- **Bug 16 — Standalone classes lost in live preview (regression of 10).** **Lesson 9** — the `{…}`
  braces were passed to the parser, dropping the leading `.class` token → strip the braces in
  `lineDecorations`; regression test. (SOLVED✓CDP)
- **Bug 17 — Resized crop left an empty band (caption pushed below).** The box kept `crop.h` tall
  while content scaled with width → `cropBoxSize` aspect-correct when one dimension is given;
  unit-tested. (SOLVED✓CDP)
- **Bug 18 — Inline (mid-text) image rendered native & full-size.** `EMBED_LINE` only matched
  standalone lines → Obsidian drew its own → the **same** widget in an inline mode (`inlineEmbeds`),
  not a separate widget. (SOLVED✓CDP)
- **Bug 19 — `lie-center` only centred _on hover_.** Obsidian forces
  `.cm-content > * { margin: 0 !important }` → it beats `margin:auto`, so centring only took after a
  reflow → centre via `text-align:center` on a full-width (`width:100%`) block embed — no
  `!important` arms race. (SOLVED✓CDP)
- **Bug 20 — Scroll jank; image sections render very late (live preview).** The block widget had
  no `estimatedHeight`, so CM6 modelled each off-screen image line as one ~14px text line; the box
  also grew 0→real after layout → `EmbedWidget.estimatedHeight` + `reserveBox` both derive from one
  pure `estimatedBlockHeight({crop,width,height})` (DRY, unit-tested; exact for crops via
  `cropBoxSize`); the async loop only refines it. (SOLVED✓CDP)
- **Bug 21 — Reveal toggles work (the true AD5 overlay model).** The reveal/edit model was briefly
  mis-built as a block-replace + plugin textarea (reverted, Lesson 11); corrected to the overlay so the reveal
  toggles and no duplicate image renders.
- **Bug 22 — Reveal/edit ABOVE the image.** The fake-link reveal + native cursor-edit sit above the
  image (AD5 overlay).
- **Bug 23 — No native `<>` edit-block icon leak.** The native edit-block button is suppressed so the
  `<>` icon never leaks alongside the overlay.
- **Bug 24 — Reset no longer whites-out the window** — `classList.add("")` on an empty class token
  threw in the CM update cycle; guarded.
- **Bug 25 — Rotate centred** via `translate(-50%,-50%)` prepend (a >100%-wide rotated img
  left-aligned under `margin:auto`).
- **Bug 26 — Snippet "png"** came from `img.png` in a CSS _comment_ — strip comments + filter file
  extensions.
- **Bug 27 — Captions** below the image, centred, width-limited, Markdown-rendered — pure CSS
  on a shrink-wrapping host.
- **Bug 28 — Toolbar anchored to the image top** via the box.
- **Bug 29 — Toolbar fold-then-wrap (D2 revised).** A measured reflow folds groups to a submenu
  trigger (Layout→Edit) then lets `flex-wrap` wrap at the dividers — verified at 700/300/150px.
- **Bug 30 — Crop rebuilt: handles scale the inner image toward the frame centre.** FRAME is the
  fixed output (size = box, aspect = presets).
- **Bug 31 — Crop committed result equals the framed region** (screenshot-verified).
- **Bug 32 — Crop overlay is exempt from the dismiss handler.**
- **Bug 33 — Filter panel gained the shared per-panel reset.**
- **Bug 34 — Size "Original"/cleared field no longer collapses the box.**
- **Bug 35 — Resize handle CSS.**
- **Bug 36 — The three demo notes migrated to native syntax.**
- **Bug 37 — Latent box-selector bug (`main.ts` `previewSize`).** It queried a non-existent class
  `.lie-image-area-rotate` so the size-preview missed the box on rotated images. At HEAD the
  renderer exports `BOX_CLASS = "lie-image-area"` and `main.ts` queries `.lie-image-area` — the
  magic-string mismatch is resolved (still worth a single `visibleBox()`/`BOX_CLASS` helper — see
  the 2026-06-03 DRY list).
- **Bug 38 — Live-preview float (`lie-left`/`lie-right`) breaks CM6 layout (cluster) — RESOLVED.** The old
  block-widget overlay's float fought CM6's virtualized line/height measurement → wrap rendered
  late / only sometimes, content jumped on scroll, the toolbar/menu didn't appear, clicks on
  wrapped text were stolen (off-by-one caret). **This SUPERSEDED the old "Option A"
  (reading-view-only float).** _Fix:_ render a `{…}` image as an **INLINE** widget in the embed's
  OWN non-BFC `.cm-line`; a `float:left/right` then ESCAPES into `.cm-content`'s BFC and shortens
  the following sibling cm-lines → real multi-line wrap, with **zero height desync** (the float
  counts to no line's height), no `contain:paint` clip, and the image kept clickable via
  `z-index:1`. The missing float↔text gap ("Bug 19") dissolved with it: the inline wrapper is NOT
  a `.cm-content` direct child, so `.cm-content > * { margin:0 !important }` never touches it.
  _No normalization dependency_ (A/B'/C): a floated image already carries `{…}` (its alignment
  class keeps the line a text line → inline widget + float-escape); a BARE image renders via our
  OWN `block:true` widget with the native image suppressed **uniformly** (cca476e), so Obsidian's
  block-promotion no longer matters and the auto-normalization was removed (4053f95).
  CDP-verified: multi-line wrap on hard-wrapped paragraphs, 0 desync over 35 lines, 0 click-steal,
  image clickable, native edit intact. (→ AD5.)
- **Bug 39 — Tall float (>~250px) derenders on scroll in LP — CAPPED.** A float taller than CM6's ~250px
  above-viewport render margin (`VP.MaxCoverMargin`, an inlined const in `@codemirror/view`)
  derenders when its anchor line scrolls out of the render window → the wrap dissolves (harmless:
  **no desync**, top-exit direction only). _Fix:_ the shared renderer marks such a float `.lie-tall`
  (via `isTallFloat`/`TALL_FLOAT_THRESHOLD_PX` in `renderer-logic.ts`) and, in safe mode
  (**default**; the `tallFloatSafe` setting → `body.lie-safe-tall-float`), it STACKS as a
  non-floated block — in **both** views (`.lie-wrapper` in LP, `.image-embed` in reading view) for
  cross-view consistency. Permissive mode floats it regardless, accepting the LP-only glitch.
- **Bug 40 — Reading-view sizing of transformed images (cluster) — RESOLVED.** (a) A transformed box
  (e.g. a rotated image sized to its natural rotated AABB) overflowed the column because the box
  `max-width:100%` was circular against the shrink-wrapping inline-block `.internal-embed`. _Fix:_
  `max-width:100%` on the embed shrink-wrap rule caps the host against its BLOCK containing block
  (the reading-view column), so the box caps too — CDP: a rotate-90 image now caps at the 521px
  column (was 800px), matching LP. (b) Not reproducible — the per-image vertical overhead is the
  native ~6px (CDP: 6px embed padding, 6px inter-image gap); the old "huge gap" was intervening
  headings/text between image groups. (c) A floated image + its wrap text on consecutive source
  lines render as `[floated .image-embed][<br>][text]` in ONE paragraph, and that first `<br>`
  pushed the wrap text a full line below the image top. _Fix:_ hide the `<br>` that is the
  next-element-sibling of a floated embed (reading view, float-only) → the text wraps from the
  image top — CDP: was +23px, now 0px. LP unaffected (0 desync, float-escape intact; R0 — reader
  now matches LP).
- **Bug 41 — Inline-icon / tiny-image toolbar mis-positioned — RESOLVED (commit `c192dcf`).** The floating
  (body) toolbar for an image too small to hold the in-chrome bar sat ON / below the image because
  `positionAbove` used `top = rect.top + 8`. _Fix:_ place the bar truly ABOVE the image
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
  fixtures at sizes 24/100/240/782px. _(This also subsumes the earlier "toolbar missing on ≤311px
  images" note — the reflow now keeps the wrapped bar in-chrome while it fits, else floats it.)_
- **Bug 42 — rotate/flip drifts an already-cropped image — SOLVED✓CDP.** _Cause:_ the crop
  rendered with a **top-left origin** and the toolbar's rotate/flip were composed INTO the same
  `<img>` transform string (`setRotation` merged a `rotate()`), so a rotate pivoted about the
  image corner and swung the cut out of frame. _Fix (3-layer, AD3):_ ORIENTATION (`rotate`/`flip`)
  is now its own model field, routed to a new **inner-frame** layer (`.lie-frame`) and composed
  **about the frame centre** (a structural pivot); the crop PLACEMENT (`transform=`) stays on the
  `<img>`, untouched. So re-orienting a crop reorients the frame and the `<img>` placement is
  byte-identical — no drift, no coordinate recompute. CDP: a 4/3 crop and the same crop + `rotate=90`
  have the **identical** `<img>` transform (`translate(-20%,-10%) scale(1.8)`), the rotate sits on
  the frame, and the footprint swaps 240×180 → 180×240. Export composes the same way (content →
  orient): the cut renders at original resolution (667×500) then the orientation rotates it
  (500×667). (Code: `transforms.ts` `rotate`/`flipH`/`flipV` fields + bare `rotate=`/`flip=`;
  `renderer.ts` outer/`.lie-frame`/`<img>` + `applyOrientation`; `export.ts` `renderContent` +
  `orient`. Regression: `tests/unit/transforms.test.ts` "rotating a CROP never touches the placement".)
- **Bug 43 — crop editor migrated to the live 3-layer model — SOLVED✓CDP.** _Cause:_ the editor
  ran on the OLD pre-rework assumptions — a `position:fixed` **clone** on `document.body` with a
  **top-left** transform-origin and absolute-px translate — while the renderer had moved to the
  3-layer DOM with a **centre** origin and `%`-translate placement. So (A) rotate pivoted the
  image corner and the framed content swung out of view (B/C the rotate "looked dead" / the
  overlay "didn't rotate" were the same top-left artifact); (D) the white handles sat on a clone
  frame, not the inner image; (E) no edge handles were ever emitted; (F) the native-handle hide
  was scoped to `.lie-wrapper` only, so it leaked in reading view; (G) a width edit desynced the
  crop; (H) the gestures were undamped. _Fix (from AD3):_ the editor now edits the live
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
  `tests/unit/crop-editor-logic.test.ts` (round-trip == no drift, edge-handle `scale(sx,sy)`),
  `tests/unit/regressions.test.ts` (width-edit keeps the crop, both paths). Structural CDP:
  `tests/cdp/verify-crop.mjs` 20/20 (self-creates `_crop-fixture.md`; manual demo `example-vault/02 — Crop.md`).) _Post-review
  hardening:_ assign `this.cropEditor` BEFORE `open()` so a synchronous self-close (image not in
  the 3-layer DOM) can't restore a dead ref and jam the trigger; skip `.lie-cropping` images in
  `reconcileFromSource` so a layout-change re-render can't clobber a live reading-view session;
  `unrotate` now mirrors the pan delta on a flipped frame too (`S·R(-θ)`, not just `R(-θ)`).
- **Bug 44 — Crop pan must grab the WHOLE image (inside AND outside the cut frame) — SOLVED✓CDP.**
  _Cause (a pointer-events/hit-area bug, not optics):_ in-place crop overflows the full image past
  the cut window; that overflow is the dim ghost (`.lie-crop-ghost-img`). `.lie-crop-ghost` is
  `pointer-events:none` and the img INHERITED it, so the whole region OUTSIDE the cut frame was a
  non-target — the pan listener (on `.lie-image-area`) only ever fired from INSIDE the cut (where
  the bright live `.lie-frame` at z:2 catches and bubbles to the area); outside there was no
  catching layer (ghost = none, chrome z:6 = none), so the drag fell through to the document and no
  pan started. _Fix (structural, at the hit layer):_ make the ghost IMG the pan hit-surface —
  `pointer-events:auto` on `.lie-crop-ghost-img` (the frame BOX stays `none`, click-through). The
  grip is now the whole visible image: INSIDE the bright `.lie-frame` (z:2) catches, OUTSIDE the dim
  ghost img (z:1) catches — both bubble to the area's pan listener; the dimming is the img's own
  opacity (no separate blocking overlay), and the chrome/handles (z:6, box `none`; only the
  handle/rotate children `auto`) still win their own hits, so pan never collides with resize/rotate.
  _Guard:_ `tests/cdp/verify-crop-pan.mjs` — a read-DOM-back CDP check that proves via real
  `elementFromPoint` hit-testing that the pan layer is hit-testable (frame box + chrome are `none`),
  a drag STARTED OUTSIDE the cut frame translates the live img, an inside drag does too, and a
  handle still wins its own hit. (Code: `styles.css` `.lie-crop-ghost-img { pointer-events:auto }`.)
- **Bug 45 — reveal toggle showed an eye icon — SOLVED✓CDP.** _Cause:_ `makeRevealButton`
  rendered `eye`/`eye-off`. _Fix:_ it now renders the Lucide **`code`** glyph (`<>`) in both
  states; the dismissed state shows faint (`.is-off`) + a flipped tooltip/aria, so the
  affordance stays honest without an eye. CDP: the toolbar reveal SVG is `lucide-code`.
- **Bug 46 — `<>` dismiss must hide the WHOLE raw embed — already covered; re-verified.**
  _Diagnosis:_ the suspected cause (`.lie-dismissed` not covering `.lie-fake-link`) was **already
  fixed** by the earlier reveal-toggle rework — `styles.css` has
  `.lie-dismissed .lie-fake-link, .lie-dismissed .lie-attr { display:none !important }`, covering
  BOTH the fake `![](…)` link and the `{…}` (and `!important` beats the non-important
  `.cm-active`/hover reveal rules). CDP confirmed: on dismiss, `.lie-fake-link` AND `.lie-attr` both
  compute to `display:none`, and the active line carries no leaked native source tokens (Obsidian
  keeps `![…]` an embed, Lesson 12 — only `{…}`/alt become editable text, which the dismiss hides). The
  dismiss-hide itself needed no CSS/markup change; the diagnose-first pass additionally **extracted
  the dismiss/auto-clear state machine to a pure `reduceReveal`** (`live-preview-logic`) — making the
  subtlest part executable-testable — and **hardened the auto-clear** so a fresh `<>` dismiss always
  takes effect in its OWN transaction (resetting only on a LATER leave / cursor-move). That closes a
  latent edge where the `:focus-within` / keyboard reveal path could reach the `<>` control with no
  prior `mouseenter` (so `hoveredLine` is unset), instantly clearing the dismiss; it also aligns the
  auto-clear with its stated "clear on leave, not within a visit" intent. Pinned by
  `tests/unit/regressions.test.ts` (the `reduceReveal` state-machine units) + `tests/cdp/verify-reveal.mjs`
  (the live-DOM `display:none` check, always mode).
- **Bug 47 — the `{…}` lost its syntax highlighting — SOLVED✓CDP.** _Cause:_ in LP the `{…}`
  block was one plain `lie-attr lie-rev-<mode>` mark with no CM tokens (the inline-widget/bare-key
  migration dropped the highlight — CDP: 0 cm-token children, plain text colour). _Fix:_ the build
  now marks the whole `{…}` with a SINGLE `Decoration.mark` carrying `lie-attr lie-rev-<mode>` PLUS
  `URL_CLASS` (`cm-string cm-url`, from `live-preview-logic`), so the revealed block is highlighted
  like a `(url)` string while the reveal/dismiss visibility rules still key on `.lie-attr`.
  **Deliberately NOT `cm-formatting`/`URL_BRACE_CLASS`:** a direct cm-line child carrying
  `cm-formatting` would match `.cm-line:has(> .cm-formatting)` — the heuristic that detects
  Obsidian's OWN native source reveal — and wrongly hide the fake link (so the `{…}` braces are
  coloured as plain url-string, not brace-formatting; regression guarded by
  `tests/cdp/verify-reveal.mjs`). CDP: the `{…}` now carries `cm-url` tokens + a themed colour.
- **Bug 48 — toolbar/menu edits wrote to the WRONG image; almost nothing appeared to persist —
  SOLVED✓CDP.** _Symptom:_ the resize handle's `width` persisted, but presets / rotate / flip /
  filter / align / crop seemed to do nothing. _Diagnosis (the hypothesis was wrong — diagnose-first
  paid off):_ `serializeTransform` and the whole `modifyTransform → serialize → writeSource` path
  were **fine** (CDP: driving any op on a SINGLE image persisted every key). The real root was the
  **source resolver**: `findImageInSource` matched by **basename and returned the FIRST
  occurrence**, so any op on a non-first embed of a **repeated file** wrote to the first image's
  line — and the demo reuses `sample-*.png` many times, so most ops "did nothing" (a far-away image
  changed instead). The resize handle escaped this because it resolves the line from the rendered
  image's **DOM position** (`view.posAtDOM(wrapper)`), not basename. _Fix (at the root):_ a new
  `locateImage` resolves the active image's line from its DOM position via CM6 `posAtDOM` (the same
  line-accurate path the handle uses), with the basename scan only as a fallback (reading view /
  no live editor); a new `findImageInLine` matches the embed on that exact line. Every toolbar/menu
  resolution (`resolveLocation` + the crop / size / filter / add-class / export openers) now routes
  through it. _Guards:_ the §2.8 per-op persistence units (pure — every op serializes its key) and
  the runnable §3 AD1 write-path matrix `tests/cdp/verify-write-path.mjs` (reads the real source
  back; includes the duplicate-image case that pins the basename collision). CDP-verified: rotating
  the SECOND of two same-file embeds writes the second line, the first stays untouched.
- **Bug 49 — F2 — reading-view render of a DUPLICATED image — SOLVED.** _Cause:_ `reconcileFromSource`
  resolved every rendered image via `findImageInText(source, basename)` → the FIRST basename
  match, so the 2nd embed of a repeated file rendered the 1st's transform (the Bug-48 failure
  mode, on the render path; the post-processor was already correct via the sibling text node).
  _Fix (AB3, root):_ the reconcile counts each basename's **occurrence in DOM order** (= source
  order) and resolves the n-th occurrence via the new occurrence-aware
  `findImageInText(text, src, occurrence)`; `image-resolver.ts` is made pure (`import type`
  Editor) so the resolver is unit-tested (`tests/unit/image-resolver.test.ts`, fails on first-match).
- **Bug 50 — Filter `[filter]` in `CLAIM_SELECTOR` — SOLVED.** _Cause:_ a bare `filter=` is runtime-only
  (a browser ignores the bare attribute), but the runtime's `CLAIM_SELECTOR` didn't list it, so a
  filter-only image was never hydrated on a foreign page. _Fix:_ added `[filter]` + `[data-filter]`
  to `CLAIM_SELECTOR` (`readTransform` already reads `filter`); docs aligned — AD2 / T3 / F25 now
  list a bare `filter` among the runtime-only keys, `style="filter:…"` as the faithful escape.
  Pinned by `tests/unit/render-core.test.ts`.
- **Bug 51 — F24 — "icon" preset couples to inline (F17) — SOLVED✓CDP.** _Cause:_ the icon preset set only
  `height: 1.5em`, not the inline rendering, so it didn't flow as an icon. _Fix:_ the preset table
  is now the pure `sizePresets` (`size-submenu-logic.ts`), where `icon` sets `inline=true` (+ the
  line-height height); the size sub-menu carries `inline` through preview/commit. Pinned by
  `tests/unit/size-submenu-logic.test.ts` + `verify-render-gaps.mjs` (source read-back → `.lie-inline`).
- **Bug 52 — Auto-persist on anchor-disconnect wrote the wrong occurrence of a DUPLICATED image — SOLVED.**
  _Cause:_ a panel (crop/filter/size) that auto-persists when its anchor has scrolled out of the
  CM6 viewport mid-edit re-resolved the line from a now-DETACHED `activeImage`, so `locateImage`
  fell back to the basename scan → first occurrence. _Fix (root):_ the shared `locateActiveImage`
  prefers the live image's `posAtDOM` only while it is **connected**; when detached it uses the
  `ImageLocation` **captured at panel-open** (passed as `modifyTransform(..., fallback)`), never the
  basename scan. The connected path is covered by the write-path matrix's Bug-48 dup row; the
  detached branch is code-verified (narrow trigger — duplicate + scroll-out mid-edit).
- **Bug 53 — (B) Toolbar ↔ sub-modal = ONE active region (flicker bug).** The in-chrome toolbar's
  visibility was pure CSS `.lie-wrapper:hover`, so moving image→panel dropped the bar (and the
  panel could flicker) the instant the pointer left the image rect — before reaching the panel.
  Fix (D6): the host binds enter/leave on **all three** members (image region + panel +
  toolbar) with the existing grace delay bridging the travel gap, and toggles `.lie-region-active`
  on the toolbar in lock-step with the panel's visibility. New CSS keeps the toolbar visible
  (greyed) while the region is active and hides it **together** with the panel when the region is
  left — for the in-chrome bar (`.lie-toolbar-in-image.lie-toolbar-inactive.lie-region-active`)
  and the floating bar (`.lie-toolbar-floating.lie-toolbar-inactive:not(.lie-region-active)`)
  alike. Pinned: `tests/cdp/verify-submodal-region.mjs` (synthetic enter/leave: grace keeps the
  region across the gap, leaving anywhere hides both together, re-entering via image/toolbar/panel
  restores both). _Review follow-up:_ the greyed bar kept `pointer-events:none` (from
  `.lie-toolbar-inactive`), so a REAL pointer moving onto the FLOATING bar (which sits outside the
  image rect) fired no mouseenter → the region dropped (the float-case flicker survived). Fixed:
  `.lie-toolbar-inactive.lie-region-active { pointer-events: auto }` makes the greyed bar a hover
  surface while its buttons stay inert (D6); `verify-submodal-region.mjs` now also asserts the bar
  is pointer-hoverable + buttons inert (structural — the synthetic events couldn't catch it).
  _Manual:_ the real-pointer `:hover` CSS travel path (not CDP-synthesizable) is a focused-window
  check.
- **Bug 54 — Click-away closes the sub-panel (crop EXEMPT).** The document-click delegate dismissed
  via `dismissToolbar` which closed crop too, so a stray click outside the image destroyed an
  in-place crop session. Fix: the delegate consults the pure `clickDismissesToolbar` — an active click
  closes+persists **filter/size** (auto-persist, one source write), but while **crop** is active NO
  click dismisses (clicks/drags on the image, handles and the dimmed ghost are editing; crop ends only
  via its own toggle / ✓ / ✗ / Esc). The IMG-reselect branch is likewise skipped during crop.
  **Boundary follow-up (real-pointer):** the first cut made the click-away boundary the whole hover
  region (image + toolbar + panel), so clicking the **image** — which fills most of the canvas — did
  NOT close an open filter/size panel (the reported bug). `clickDismissesToolbar` now takes
  `{cropActive, panelOpen, insidePanel, insideRegion}`: while a modal panel is open the boundary
  SHRINKS to the sub-panel (`.lie-submenu, .lie-filter-panel`) plus the toolbar chrome — a click
  anywhere else (the image included) closes+persists; with no panel it falls back to the whole-region
  dismiss. Crop stays exempt (`cropActive` short-circuits) and the IMG-reselect branch is suppressed
  while a panel is open. Pinned: `tests/unit/toolbar-region-logic.test.ts` (7 cases, both boundaries) +
  `tests/cdp/verify-region-clickaway.mjs` (read-source-back: empty-space AND image-click close+persist,
  crop stays open with no write — verified live 14/14).
- **Bug 55 — Panel visibility FIRMLY coupled to toolbar visibility (no in-between state).** Open a
  panel (bar greyed) → leave → the bar could flash **un-greyed** while the panel was open, because
  the CSS `:hover` rule (`opacity:1`, 0,3,0) _out-specified_ `.lie-toolbar-in-image.lie-toolbar-inactive`
  (`opacity:0`, 0,2,0) and raced the async `.lie-region-active` toggle. Fix: the in-chrome bar's
  `:hover`/`:focus-within` rules now carry `:not(.lie-toolbar-inactive)`, so the moment a panel
  opens the CSS `:hover` stops competing and the bar's visibility + staying-greyed ride the host's
  ONE region signal alone (`.lie-region-active`). The bar stays greyed the **whole** open duration;
  hover-leave hides bar+panel together (panel stays open), hover-return shows them together. The
  shared binder also tracks a member **set** (nesting-robust: toolbar→image stays inside). Pinned:
  `verify-submodal-region.mjs` extended (shown bar = opacity 0.4 never 1; hidden = opacity 0 and
  still `.lie-toolbar-inactive` the whole time).
- **Bug 56 — Group popups / class dropdown coupled like Bug 55, but NOT greyed.** The folded-group
  popups (`.lie-group-popup`) and the add-class dropdown (`.lie-class-dropdown`) live on
  `document.body` (outside the wrapper paint box), so hovering them dropped `.lie-wrapper:hover` and
  the in-chrome bar vanished. Fix: `couplePaletteToRegion` binds the palette + wrapper + toolbar as
  ONE region (the same binder) and marks the wrapper `.lie-region-hover` while hovered — the new CSS
  `.lie-wrapper.lie-region-hover .lie-toolbar-in-image:not(.lie-toolbar-inactive)` keeps the bar
  visible (NOT greyed — palettes are not modal) — and closes the palette when the region is left, so
  bar + palette fade together. `.lie-class-dropdown` is also added to the region selector + the
  floating-bar mouseover guard. Pinned: `tests/cdp/verify-popup-region.mjs` (popup keeps the region,
  bar stays visible+not-greyed, leaving closes both).
