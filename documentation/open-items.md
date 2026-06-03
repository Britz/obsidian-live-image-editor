# Open Items — Live Image Editor

> The single, findable backlog of everything still open — design decisions, verifications,
> deferred work, spec gaps, housekeeping, and the implementation. Kept here on purpose so nothing
> gets lost in conversation. Each item has a **status**: `DECIDE` (needs the user's call),
> `FOLD` (decided — to write into the artifacts), `VERIFY` (empirical check needed),
> `DEFER` (design idea, not yet decided), `SPEC` (under-specified detail), `CHORE` (housekeeping).

---

## 1. Needs a decision (DECIDE)

- **Reveal/edit model — RESOLVED: overlay + CSS reveal + native edit (2026-06, re-tested).**
  *This supersedes the earlier "native path CLOSED → self-built field" conclusion.* The live-preview
  adapter **does not replace** the image line (AD5): it **overlays** the plugin's own image (the one
  uniform widget, R0/AD3) and **CSS-suppresses Obsidian's native image** (scoped to the native
  `.image-wrapper`, never the plugin's `.lie-wrapper`). The L1 *observation* — an un-replaced line
  re-fires Obsidian's native embed and shows `{…}` as text — **still holds**, but is now **embraced**
  (the native embed is *wanted*, for its image load and its cursor-reveal, and merely CSS-hidden), not
  avoided; so the old "always replace" rule is superseded.
  - **Reveal-for-looking (F8 — KEPT):** a display-only **fake raw link** (the plugin knows the link,
    so it paints it) + the `{…}`. The **`<>` reveal control** stays — a **binary show/hide** toggle,
    **not persisted per image** (F8; a transient class on the box the CSS keys on) — alongside the
    cursor (`.cm-active`) and hover reveal (pure CSS, on `.lie-wrapper`). The **default** state
    (shown/hidden) is a single **global setting** (AB19/F20). There is **no** per-line AUTO/ON/OFF
    mode and **no** `cycleRevealMode` (per-image persistence would contradict F8). Only the in-widget
    *edit* field is designed out (see F9) — the `<>` reveal control is not the edit field.
  - **Edit (F9):** **Obsidian's own native cursor-reveal** of the source as **real document text**. On
    re-test (Obsidian 1.12.7) this **works for both standalone and inline** embeds — they don't
    materially differ (a standalone embed shifts down a line when its source appears; the overlay
    follows). So caret/selection/copy are native, **one editing root** — the in-widget
    `<textarea>`/`contenteditable` and the caret in/out "seam" are **designed out**. *(The earlier
    "image lines aren't handed back as editable source" finding was the textarea-cursor concern — now
    moot, since editing uses native source, not a plugin field.)*
  - **`{…}` (F3):** Obsidian leaves it as literal text; the plugin **hides it via CSS when rendered**
    and shows it when the line is active — same `.cm-active` signal.
  - **To verify (VERIFY §3):** that `.cm-active` flips in **lock-step** with Obsidian's reveal
    (fallback signal: the native widget's DOM presence via `:has()`).

- **Temperature — gotcha #3 (F10).** Recommend **dropping it**: a clean two-way temperature isn't
  expressible with native colour filters (none is a true warm/cool white-point shift; any
  approximation rides on the other sliders and can't be inverted). Keeping it would need a
  non-native pixel path. **Confirm: drop, or keep via the harder route?**

---

## 2. Decided this session — to write into the artifacts (FOLD)

- **#1 Export resolution (F13).** **Done & captured** (F13 / AB15 / §3.4): export from the
  **original image's native resolution** (highest quality; the display size never reduces it).

- **#4 Inline ≠ size; uniform chrome.** Inline and size are **two orthogonal settings**:
  *inline* = the image **flows in the text** where it sits; *icon* = a **size** preset (image height
  = line height). There is **no "chrome skipped for inline"** special case — every image is treated
  the same (R0); the existing too-small handling (D1.1 toolbar-above, D9.1 caption-on-hover) covers a
  tiny inline icon. → fold into F17, F24, AB9, §3.3.

- **#5 Routing rule.** Image = box (one unit). **Everything goes to the box, except `transform` and
  `filter`, which go to the image.** An unexpected style property therefore goes to the box.
  (Classes are separate: marker on the image; alignment/inline route to the embed.) → tighten §2.3
  routing + AD2.

- **#6 Snippets (F16 / F16.1).** **Install** copies the shipped CSS into the snippets folder
  **without force-overwrite** — so it is effectively a *restore of deleted files*; a same-named
  existing file is left as-is. **Reset is per-file**, restoring to the shipped original (a diff
  detects whether it was edited; the shipped CSS lives in the plugin). **Plus newly specified:**
  (a) **hide** the add-class dropdown when there are no applicable snippets; (b) only scan/offer
  snippets that are **enabled in Obsidian**, not merely present in the folder. → fold into F16/F16.1,
  AB4, §3.1.

- **#7 Crop pixel-quantization (F12).** Already required: F12 says the cut quantizes to whole pixels
  + fixed angle steps live during the interaction. (Confirmed present.) The responsive box-relative
  scaling of a crop is **VERIFY** below.

---

## 3. To verify empirically (VERIFY)

- Caption pure-CSS sizing against the **implemented** new DOM (verified in isolation, not the real
  structure).
- Toolbar container-query with the box's **aspect-ratio** height (tested with an explicit px height).
- Reveal: the in-plugin test for the chosen model, + the native-suppression experiment (gotcha #2).
- Crop **responsive** box-relative scaling (#7) — should be fine (clean cut in source, scaled
  display), but untested.

---

## 4. Deferred design / elegance (DEFER)

- **Toolbar unification:** one CSS positioning for both views (currently two mechanisms).
- **Crop-in-place** vs the mirroring overlay (the overlay duplicates the box+img geometry).
- Smaller chrome items: resize handle, anchored sub-menu, filter-panel docking — all anchor to the
  uniform box.

---

## 5. Under-specified details (SPEC)

- Exact **crop serialization** tokens (how the cut-frame aspect + the placement sit in the
  attribute block).
- Shared **sub-menu host** component API (D6 / F14).
- **Link-form conversion** edge cases (F5 / F6).

---

## 6. Housekeeping (CHORE)

- **Test Plan** (`documentation/test-plan.md`): a **draft** only — review/validate together; the
  actual tests aren't written.
- **CLAUDE.md cleanup — DONE (2026-06-02).** Slimmed to a lean build/debug guide (Project, Build &
  Test, CDP) + a documentation map pointing to `documentation/`. The old duplicated
  requirements/architecture/known-bugs were removed: bugs & lessons → `issues.md` (L1–L10, Bug 1–21);
  the DRY/KISS audit → §8 above; coding conventions folded into `requirements.md` T9.

---

## 7. The big one: implementation

All of the above is **design**. The code is still the **old model** (custom properties, the crop
data type, the JS box-measure loop, the JS caption width-sync, the mirroring crop overlay, the
reveal text-field, …). `implementation-plan.md` describes the **target**; building it — and updating
the tests — is the **largest remaining effort**. (The module-map annotations mark the
going-away exports.)

---

## 8. DRY/KISS audit findings (2026-06-02) — not yet acted on

A verified audit of `src/` against the supreme directive found these duplications / KISS issues.
**Against the OLD code** — many dissolve in the rebuild, but each is a concrete "do it once" the
target design must honour (so they're not reintroduced). Per `methodology.md`, first check whether
each traces to a missing requirement or architecture point, then consolidate. *(File:line were from
the audit-time state — re-confirm before editing.)*

**Geometry & transforms — one source**
- `export.ts` `canvasFilter` re-lists the filter functions / units / defaults that `transforms.ts`
  and `styles.css` already encode → reuse a shared `canvasFilterString` built from the filter table.
- `export.ts` rotation branch recomputes the rotated bounding box that `renderer-logic.ts`
  `rotatedBox` already provides → call `rotatedBox(...)`.
- "filter ≠ default" is iterated **4×** (`serializeTransform` / `isDefaultFilter` / `filterToVars`,
  and `filter-panel.ts` `currentFilter`) → one `nonDefaultFilter()` helper.
- The "visible image box" selector is a magic string repeated across files; **latent bug:**
  `main.ts` `previewSize` queried a non-existent class `.lie-box-rotate` (the renderer creates
  `.lie-rotate-box`), so the size-preview missed the box on rotated images → export a single
  `ROTATE_BOX_CLASS` / `visibleBox()` and use it everywhere.

**`main.ts` panel openers**
- `customSize`, `crop`, `toggleFilters`, `addClass`, `exportImage` each re-implement the
  `activeImage → view → editor → findImageInSource → parseAltText` boilerplate that
  `resolveLocation()` already encapsulates (and silently drop its Notice) → funnel through it.
- `addClass` builds a **4th** ad-hoc popup (own outside-click / zIndex / Esc) next to the toolbar
  group popup and the anchored sub-menu → one shared popup/host (ties to D6 / F13).

**UI building blocks**
- Icon-button build repeated **3×** in `anchored-submenu.ts` `buildHeader` → one `iconButton()`.
- Text/preset-button build repeated in crop / size / filter panels → one `textButton()`.
- Filter-panel slider row duplicated (temperature + normal) → one `sliderRow()`.
- `crop-editor.ts` teardown duplicated in `close()` and `confirm()` → one `teardown()`.
- `styles.css`: ~5 button classes repeat radius / cursor / `:hover` → one base `.lie-btn` + variants.

**Behaviour-near (verify carefully — L8 / L10 / Bug-2 territory)**
- `caption.ts` tracks the box width with its **own** rAF + `setTimeout` polling **and** a
  `ResizeObserver`, duplicating what the box already computes → couple the caption width to the box
  instead of re-measuring (the new aspect-ratio model removes most of this).
- Embed-matching regexes are scattered across `caption-logic.ts`, `live-preview-logic.ts`,
  `image-resolver.ts` and `live-preview.ts` → share an embed-token sub-pattern (capture groups
  differ, so do **not** force one single regex).

**Rejected during the audit (do NOT chase):** a "second `resolveEmbedFile` in `live-preview.ts`"
(doesn't exist — that line is `writeWidth`); and the floating toolbar vs the in-image toolbar are
**not** a duplicate (both build via `buildToolbarElement`).
