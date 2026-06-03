# Test Plan — Live Image Editor

> The test-plan artifact — the **Mid & Low-level concept** from `methodology.md`: *how the work
> is verified*, at three levels. It is derived **in parallel** with `architecture.md` and
> `implementation-plan.md` and **from** them: every case here traces up to an architecture
> decision (`ADn`), a building block (`ABn`), a requirement (`Fn` / `Dn` / `Tn`), or a learned
> hazard (`T-Ln`, the realization pitfalls in implementation-plan §4 / CLAUDE.md).
>
> **The three levels, and what each ensures** (`methodology.md` Test-Plan concept):
>
> | Level | Verifies | Mechanism | Where it runs |
> |---|---|---|---|
> | **Unit (Low)** | the **implementation** — each pure `*-logic` unit is correct in isolation | vitest | CI / devcontainer |
> | **Integration (Mid)** | the **architecture decisions & contracts** (ADn) hold end-to-end | CDP eval | running Obsidian |
> | **Behaviour / acceptance (High)** | the **requirements** (Fn/Dn) are met as a user sees them | CDP eval | running Obsidian |
> | **Regression** | every fixed bug and learned hazard stays fixed | unit where extractable, else CDP | both |
>
> **Why the split.** Per `AD7` / `T8`, all decision logic is extracted into framework-free
> `*-logic.ts` units, so the *implementation* is testable without Obsidian or CodeMirror present
> (these do not resolve under vitest — `T-L6`). The *architecture* and *behaviour* depend on the
> live framework (CM6 decoration machinery, Obsidian's embed rendering, the native save dialog),
> so they are verified in the running app over the Chrome DevTools Protocol bridge (`AB23`). The
> dividing line is exactly the `AD7` extraction boundary: anything a pure function returns is a
> unit test; anything that needs the DOM, CM6, or Obsidian's own rendering is CDP.

---

## 1. Intro

This plan verifies the Live Image Editor at three altitudes, each derived from the artifact
above it:

- **Unit tests (Low)** confirm the **implementation** — the pure geometry, line→decoration
  mapping, caption-text extraction, crop quantization, sub-menu placement, transform
  round-trips and link-form normalization — the `*-logic.ts` units that `implementation-plan.md`
  §1 lists and `AD7` mandates. Run with vitest.
- **Integration tests (Mid)** confirm the **architecture decisions** (`AD1`–`AD9`) hold once the
  pieces are wired into Obsidian — the source round-trip, the verbatim native-CSS routing, the
  uniform box and its one sizing direction, the two adapters producing one DOM, the one-path-per-
  mode overlay with the native image CSS-suppressed, declarative sizing with no measure loop, the
  shared sub-menu host, and the platform-reuse seams. Verified by CDP eval in a running vault.
- **Behaviour / acceptance tests (High)** confirm the **requirements** (`Fn`/`Dn`) as observed by
  a user. Verified by CDP eval in a running vault on the example pages.
- **Regression tests** pin every entry in the CLAUDE.md *Known bugs* list and every `T-Ln`
  lesson, at whichever level catches it (a pure-logic regression becomes a unit test per the
  *write-tests-for-behaviour-changes* working rule; an integration-only one stays CDP).

The pure units live under `tests/*.test.ts`; the CDP checks run via the dev-bridge
(`AB23` / CLAUDE.md *Live debugging*) against the example vault pages (`examples/`), which are
fixtures exercising each requirement area.

---

## 2. Unit tests (Low) — per pure `*-logic` unit

Each block is a pure function set with no framework imports (`AD7`, `T8`); the test states what
each case **verifies**, not how the code does it. Files map to `implementation-plan.md` §1.

### 2.1 `renderer-logic.ts` — geometry (`AB5`)

Pure box / inner-image geometry; the single source shared by the renderer and the export
(`AD3`, `AD6`, rendering ≡ export).

- **`rotatedBox`** — for a 0° image the box equals the image (the degenerate case is not
  special, `AD3`); for 90 / 180 / 270 the box is the rotated bounding box (w↔h swap at quarter
  turns); for a free angle the box is the true rotated AABB. Verifies that the **angle reflows
  the box** at edit time, never at render (`AD6`, `T5`).
- **`cropBoxSize`** — given a crop frame and an explicit `width` with **no** `height`, the box
  height is derived aspect-correctly from the frame (not left at the frame's own height);
  given both, both are honoured; given neither, the frame size stands. Verifies the crop box is
  the **cut frame**, independent of the (larger) inner image, and rescales by the column for
  free (`implementation-plan.md` §2.3). *(Pins Bug 18.)*
- **`estimatedBlockHeight`** — returns a synchronous, finite height estimate from the stored
  size for CM6 block measurement, so no async measure is needed (`AD6`).

### 2.2 `live-preview-logic.ts` — line → decoration mapping (`AB9`)

- **`lineDecorations`** — a standalone image line yields one block decoration; the returned
  `params` is the attribute **content without** the `{` `}` braces. Verifies the model↔adapter
  contract that prevents the dropped-`.class` bug (`T-L9`; `implementation-plan.md` §4).
- **`inlineEmbeds`** — a line with a mid-text embed yields inline-mode decoration spans at the
  correct offsets; a standalone-only line yields none; multiple inline embeds on one line each
  map. Verifies inline images are found for the same widget in inline mode (`F17`, `AD5`).
- **`rewriteWidth`** — rewrites only the size in the attribute block, leaving the link, alt
  text, classes and other declarations intact. Verifies a resize is a minimal source edit
  (`AD1`, `D11`).
- **`EMBED_LINE`** — matches a standalone image line (Markdown and wikilink forms, with/without
  native size and a trailing block) and rejects a mid-text occurrence. Verifies the standalone
  vs inline split feeding the two modes.

### 2.3 `caption-logic.ts` — caption text (`AB7`)

- **`captionFromAlt`** — extracts the alt text as the caption source and **strips a native
  `|size` suffix** (the size is not caption text); empty / size-only alt yields no caption.
  Verifies the single-source rule (`F22`).
- **`captionMarkdown`** — passes Markdown through unaltered for the platform renderer to format
  (bold / italic / code / links), escaping nothing that should render. Verifies caption content
  is Markdown, not plain text (`F22`, `AD9`).

### 2.4 `crop-editor-logic.ts` — live quantization (`AB12`)

- **`snapTranslate`** — quantizes the pan to whole pixels during the drag; verifies the cut can
  never fall mid-pixel (`F12`).
- **`snapAngle`** — quantizes rotation to the fixed angle step live; verifies the rotation cut
  is quantized continuously, not only on commit (`F12`).
- **`snapScale`** — quantizes zoom to its step; verifies the scaled cut stays on a clean step.
- **`toCropData`** — composes the quantized pan / angle / scale + frame into the stored
  transform (translate% + rotate + scale + box w/h). Verifies the editor emits exactly the
  native-CSS placement the renderer and export consume (`AD2`, rendering ≡ export).

### 2.5 `anchored-submenu-logic.ts` — placement (`AB11`)

- **`placeSubmenu`** — a compact menu is placed under the toolbar; a menu that would overflow
  the viewport is clamped back in (never flipped past the explorer / off-canvas), and the large
  filter panel is placed beside the image on the roomier side. Verifies the **one** placement
  policy the shared host uses for every panel (`AD8`, `D6`, `D7`).

### 2.6 `transforms.ts` — model round-trip (`AB1`)

- **`parseAltText` / `serializeTransform` round-trips** — parse-then-serialize and
  serialize-then-parse are stable for normal, rotate, flip, filter, sized, cropped and
  class-bearing inputs; unknown / pass-through `transform` and `filter` functions survive
  untouched (a power-user `skew()` / extra filter passes through, `AD2`). Verifies the canonical
  block is the lossless single encoding (`F1`, `T2`).
- **Brace-stripping (`T-L9`)** — when given content **with** braces the leading `.class` token
  is lost, but the model's own entry point strips them, so an end-to-end parse keeps the leading
  class. Verifies the contract pitfall is guarded at the unit boundary (`implementation-plan.md`
  §4).
- **`temperatureAdjust`** — derives the warmth nudge from the other filter values and is **not**
  stored on its own. Verifies temperature is a derived control (`F11`).
- **Edge cases** — empty block, block with only `style=`, only classes, native size present;
  malformed declarations degrade without throwing. Verifies graceful parsing (`F25`).

### 2.7 `link-format.ts` — link form & native-size normalization (`AB2`)

- **`desiredFormat` / `convertEmbedLine`** — converts Markdown↔wikilink only when the desired
  form differs, carrying the trailing block across **verbatim** and preserving alt text and
  path. Verifies link form follows Obsidian's setting while the block stays intact (`F5`, `T2`).
- **Native-size folding** — a Markdown `|size` is folded into the block; a wikilink `|size` is
  left as written. Verifies `F6` exactly.
- **Never the `alias` arg** — the conversion never routes the size through
  `generateMarkdownLink`'s `alias` argument (which would push size into alt text). Verifies the
  `T-L5` pitfall is guarded; falls back to leaving the link as-is on any failure
  (`implementation-plan.md` §3.1).

---

## 3. Integration tests (Mid) — one per load-bearing decision

One test per architecture decision (`AD1`–`AD9`), each confirming the decision **holds when
wired into the running app**. These are **not** unit-testable (CM6 / Obsidian are required) and
run via CDP eval against the example vault (`T-L6`, `AD7`).

- **AD1 — Source is the single source of truth.** Apply an edit (e.g. rotate), read the source
  line back, confirm it serialized into the trailing block; switch reading view ↔ live preview
  and confirm the render reflects the **source**, not a cached state; confirm no second store
  exists (the only mutation path is the source). *Verifies: no stale render survives a mode
  switch or reused embed (`F2`).*
- **AD2 — Declarative native-CSS routing, verbatim.** Confirm `transform` / `filter` land on the
  **img** and `width` / `height` / `aspect-ratio` on the **box**, by **property name**, with the
  declaration contents passed through unparsed (a hand-authored `skew()` or extra filter
  function survives on the rendered img). *Verifies the contract is applied verbatim, no value
  parser (`T2`, `T3`, `F25`).*
- **AD3 — Uniform box, box→image direction.** Confirm normal, rotated, flipped, cropped,
  filtered and sized images all have the **same** embed → box → img structure (no
  `display:contents`, no per-state fork), and that the **box** carries the size while the **img**
  follows. *Verifies the uniform element and one sizing direction (`T5`).*
- **AD4 — Two adapters, one DOM.** Render the same image in reading view and live preview;
  diff the produced DOM structure and the resulting box / img sizes. *Verifies both adapters
  produce the same structure and visual result (`T4`, `F4`).*
- **AD5 — Overlay + CSS-suppress / one path per mode / inline same widget.** Confirm the
  live-preview widget does **not** replace the standalone line: the line's text stays intact, the
  plugin draws its **own** transformed image as an overlay (the one uniform widget), and
  Obsidian's native image is suppressed by static scoped CSS (Obsidian's `.image-wrapper` hidden,
  the plugin's own `.lie-wrapper` never). Confirm the `{…}` is real document text the plugin
  CSS-**hides** when rendered and shows when the line is active (`.cm-active`); confirm the
  reveal-for-looking is a display-only "fake" raw link painted by the plugin, shown/hidden purely
  by CSS keyed on hover/focus and `.cm-active` (no reactive JS); confirm an inline embed uses the
  **same** non-replacing overlay widget in inline mode with the **same** uniform chrome (class
  marker present; chrome is uniform — only its placement differs, `AB9`). *Verifies one owning path
  per mode, no double render, the native embed embraced and CSS-hidden (`F3`, `F8`, `F17`, `T6`).*
  *To verify (`DEC-6`): that `.cm-active` flips in lock-step with Obsidian's native source-reveal
  (so the CSS-keyed reveal coincides exactly with the source becoming editable), with the
  native-widget-DOM-presence `:has()` fallback when the lock-step assumption does not hold.*
- **AD6 — Declarative sizing, no measure loop.** Confirm a rotated image converges to the
  stored bounding-box size with **no** render-time measure/retry — including with a cached image
  and a backgrounded window (animation frames throttled). *Verifies sizing is box→image at edit
  time, designing out the rotated-box drift (`T7`).*
- **AD8 — Shared sub-menu host.** Open crop, filters and resize; confirm each opens through the
  **one** host — greyed toolbar, icon reset/accept/dismiss, Esc-dismiss, open/close toggle — and
  that only **placement** differs by size. *Verifies the single component, not per-feature
  reimplementation (`F14`, `D6`).*
- **AD9 — Platform reuse.** Confirm captions render via Obsidian's `MarkdownRenderer`, resize
  uses the native handle/frame, the column cap reads `--file-line-width`, link conversion calls
  `fileManager.generateMarkdownLink`, and i18n follows Obsidian's locale. *Verifies the platform
  is the building block, not a parallel reimplementation (`F5`, `F22`, `F21`, `D4`).*

*(AD7 — testability — is verified by §2 existing at all: every decision logic has a pure unit.)*

---

## 4. Behaviour / acceptance (High) — by requirement area

User-observable behaviour, verified by CDP eval in a running vault against the example pages.
Grouped by area; each line states what is checked.

- **Transforms (`F10`, `F4`).** Rotate cw/ccw (quarter turns) reflows to the bounding box in both
  views; flip h/v mirrors; combined rotate+flip composes; reset clears. All render identically
  in reading view and live preview.
- **Crop (`F12`, `D8`).** Activating crop keeps the image's size/position (no jump); the original
  is movable / rotatable / scalable under a resizable frame; outside is dimmed, inside full
  opacity; the live cut quantizes to whole pixels and fixed angle steps **during** the drag; the
  result clips correctly and the box is the cut frame.
- **Filters (`F11`, `D7`).** Each slider (brightness, contrast, saturate, hue, blur, grayscale,
  sepia) changes the image live; presets apply; temperature nudges the other sliders without a
  stored value of its own; double-click resets a slider; the panel docks on the roomier side and
  hides when the image scrolls out of view.
- **Export (`F13`).** Exported file reproduces all transforms + filters **exactly as displayed**
  (rotation → rotated output, crop → clipped output, filters baked in); the save offers the
  native dialog at the original folder with a free `{name}-{n}` pre-filled and never overwrites
  silently (native dialog verified manually — not CDP-reachable, §6).
- **Captions (`F22`, `D9`).** Alt text renders as a Markdown caption below the image (bold /
  italic / code / links formatted), centred, muted, **never wider than the image** (long caption
  wraps within the image width), tracking the image through resize / column change; width
  follows the **visible** box (rotated/cropped → visible cut width); toggle off by default;
  too-small images show the caption on delayed hover (`D9.1`).
- **Classes & snippets (`F15`, `F16`, `F24`).** Built-in alignment (left/right/center) and inline
  classes toggle and reset; size presets (icon/small/medium/large/original) apply via the width
  mechanism; vault-snippet classes are discovered, offered, individually de-selectable, and
  refresh on change; bundled example snippets install opt-in and reset to shipped (`F16.1`).
- **Link form (`F5`, `F6`).** Toggling Obsidian's *Use [[Wikilinks]]* converts the link while the
  trailing block stays intact; a Markdown native size folds into the block; a wikilink native
  size is left as written.
- **Inline images (`F17`).** An image mid-sentence renders at its inline size in both views — not
  Obsidian's native full-size inline image — through the **same** uniform overlay widget and chrome
  as standalone (only the placement differs), with no `{…}` shown as text.
- **Float & wrap (`F18`).** Left / right alignment floats the image and the surrounding text
  wraps around it in both views, including the hard cases (rotated + float + wrapped, cropped +
  float + wrapped), verified by measuring actual line-box rects (not the full-width border box).
- **Settings (`F20`, `D11`).** General toggles (hover toolbar, captions, default reveal state),
  preset widths, snippet list with per-class toggles and install/reset, and editing-toolbar
  integration all take effect live; edits never jump scroll or move the cursor.
- **i18n (`F21`).** Switching Obsidian's locale switches the plugin's strings (reusing platform
  strings where available) with English fallback; the filter panel widens so translated labels
  fit, never clipped (`D6`).
- **Toolbar & sub-menu UX (`F7`, `D1`–`D2`, `D6`).** The toolbar appears on selection and hover,
  sits inset at the top (above the image when too small, `D1.1`), follows the defined order, and
  wraps at dividers on overflow; every sub-menu is fully visible, never clipped or internally
  scrolled, and the image + toolbar + open panel form one continuous active region.

---

## 5. Regression tests — one per fixed bug + per learned lesson

A regression test pins each entry once it is fixed (CLAUDE.md *Known bugs* + the `T-Ln`
lessons). Pure-logic regressions become **unit** tests (§2); the rest are **CDP** checks (§3/§4).

### 5.1 Per fixed bug (CLAUDE.md *Known bugs*)

| Bug | What it pins | Level |
|---|---|---|
| Bug 1 | ~~AUTO reveal shows on first render (recompute on hover/focus, `offsetParent` guard)~~ — **obsolete**: reveal is now pure CSS keyed on hover/focus and `.cm-active`, no reactive-JS recompute on first render | n/a |
| Bug 2 | Rotated box sized responsively via the one render path (no transient parent width) | CDP (`AD6`) |
| Bug 3 | Filter panel docks on the roomier side, tracks/hides with the image | CDP (`placeSubmenu` unit + `D7`) |
| Bug 4 | Crop survives image drag (frame `pointer-events:none`, handles re-enable) | CDP |
| Bug 5 | `+`/`-` size buttons absent from the toolbar order | CDP (`D2`) |
| Bug 6 | Toolbar clusters separated by dividers | CDP (`D2`) |
| Bug 7 | Filter sliders do not overlap (group spacing) | CDP |
| Bug 8 | Temperature slider moves itself and the others (match by key, not index) | CDP |
| Bug 10 | Custom-size sub-menu has width **and** height fields | CDP (`D6.1`) |
| Bug 11 | Alignment classes float the embed (`:has()` on the container) | CDP (`AD3`) |
| Bug 12 | Native resize handle/frame shown on hover, hidden while cropping | CDP (`D4`) |
| Bug 13 | Export never overwrites silently (superseded by the save dialog) | CDP (`F13`) |
| Bug 14 | ~~Revealed link editor is borderless~~ — **obsolete**: there is no plugin-owned editable field anymore; editing is native document text (Obsidian's own cursor-reveal), so `D5`'s borderless requirement is satisfied natively | n/a (`D5`) |
| Bug 15 | No-size image fits the column, no overflow | CDP (`D3`) |
| Bug 16 | Resize frame hugs the image (zeroed wrapper padding) | CDP (`AD3`) |
| Bug 17 | Standalone classes reach the img in live preview — **brace-stripping** | **unit** (`live-preview.test.ts`) + CDP (`T-L9`) |
| Bug 18 | Resized crop has no empty band — `cropBoxSize` aspect-correct | **unit** (`renderer-logic.test.ts`) + CDP |
| Bug 19 | Inline mid-text image uses the same widget in inline mode, not native | **unit** (`inlineEmbeds`) + CDP (`F17`, `AD5`) |

### 5.2 Per learned lesson (`T-Ln`)

| Lesson | Regression it guards | Level |
|---|---|---|
| `T-L1` | An un-replaced line re-fires Obsidian's native embed and shows `{…}` as text — the still-true observation that now **motivates** the model: embrace the native embed (it loads the image + reveals the source) and CSS-hide both the native image and the `{…}` when rendered | CDP (`AD5`) |
| `T-L2` | StateField (block + inline decorations) drives the overlay, not a ViewPlugin | CDP (`AD5`) |
| `T-L3` | Transforms stored **only** in the trailing block (never alt / pipe) | unit (`transforms`) + CDP |
| `T-L4` | Never `disablePlugin` via CDP — diagnostic constraint, not a test | n/a (process) |
| `T-L5` | Link conversion never uses the `alias` arg | **unit** (`link-format.test.ts`) |
| `T-L6` | Decision logic tested pure, not by CDP — the §2 split itself | unit (structural) |
| `T-L7` | One DOM structure for every image | CDP (`AD3`) |
| `T-L8` | One render path per mode, no double render — the plugin's overlay is the only painted image, Obsidian's native image CSS-suppressed (and the reading-view reconcile skips widget-owned embeds) | CDP (`AD5`) |
| `T-L9` | `params` brace-less before `parseAltText` | **unit** (`transforms` + `live-preview`) |
| `T-L10` | No reliance on rAF/ResizeObserver alone — designed out by `AD6` (box→image, no measure loop) | CDP (`AD6`, `T7`) |

> `T-L10` was the *workaround* for an imperative measure-then-resize loop; `AD6` removes that
> loop entirely (sizing is box→image, declarative), so the regression check is that **no
> render-time measure/retry exists**, verified under a backgrounded window (`T7`).

---

## 6. What is NOT unit-testable (CDP-only)

Per `T-L6` and `AD7`, anything that needs the live framework cannot be a vitest unit and is
verified only by CDP eval in the running app (or, where noted, manually):

- **CM6 decoration & widget behaviour** — the overlay block widget (line left intact) and the
  same non-replacing overlay widget for mid-text inline embeds (no `Decoration.replace`; uniform
  chrome, placement differs only), block vs inline mode, the StateField rebuild on
  docChange / selection / mode toggle (`@codemirror` does not resolve under vitest).
- **Obsidian embed rendering** — that an un-replaced line re-triggers Obsidian's own native
  embed (the basis for `AD5`'s overlay + CSS-suppress model: the native embed is embraced for the
  image load and the source cursor-reveal, then CSS-hidden), reconcile skipping widget-owned
  embeds, native spacing.
- **DOM measurement & responsiveness** — actual box / img sizes, column-cap behaviour, caption
  width-sync, float text-wrap (measuring real line-box rects), the backgrounded-window
  convergence (`T7`).
- **Platform integration** — `MarkdownRenderer` output, the native resize handle/frame, locale
  switching, snippet discovery from the vault adapter, link conversion via the file manager.
- **The OS-native save dialog (`F13`)** — opens an OS dialog outside the page, **not** reachable
  over CDP; verified **manually**. The render half (`renderTransformedImage`) is exercised via
  the shared geometry unit (`renderer-logic`) and CDP, decoupled from the save.

The pure logic everything above depends on — geometry, line→decoration mapping, caption text,
crop quantization, placement, the model round-trip and link normalization — **is** unit-tested
(§2), so the CDP layer only has to confirm the wiring, not the logic.
