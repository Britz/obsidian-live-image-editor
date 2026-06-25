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
> (these do not resolve under vitest — `Lesson 6`). The *architecture* and *behaviour* depend on the
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
  mode widget with the native image uniformly CSS-suppressed, declarative sizing with no measure
  loop, the shared sub-menu host, and the platform-reuse seams. Verified by CDP eval in a running vault.
- **Behaviour / acceptance tests (High)** confirm the **requirements** (`Fn`/`Dn`) as observed by
  a user. Verified by CDP eval in a running vault on the example pages. These include **functional
  (interaction-driven)** checks that DRIVE the UI as a user would — entering a value in a panel,
  clicking a control — and then verify **both** the visible result **and** the persisted source
  `{…}` (never assuming the write, per the Bug 56 load-bearing rule).
- **Regression tests** pin every solved bug (the `Bug N` entries in `CHANGELOG.md`) and every `T-Ln`
  lesson (in `issues.md`), at whichever level catches it (a pure-logic regression becomes a unit test per the
  *write-tests-for-behaviour-changes* working rule; an integration-only one stays CDP).

Behaviour/acceptance and regression checks are written **implementation-independent** — black-box,
the way a user would test (observe the running app for the visible result) — so they survive
refactors and Obsidian version changes. They are **additive** to the implementation-coupled
unit/structural checks, not a replacement.

The pure units live under `tests/unit/*.test.ts`; the CDP checks run via the dev-bridge
(`AB23` / CLAUDE.md *Live debugging*) against the example vault pages (`example-vault/`), which are
fixtures exercising each requirement area. The read-back CDP checks are
`tests/cdp/verify-write-path.mjs` (the §3 AD1 write-path matrix, the Bug 56 guard) and
`tests/cdp/verify-crop.mjs` (the Bug 51 crop editor — structural facts read back from the live
DOM/source in Live Preview **and** reading view: no `document.body` clone, handles
on the inner image, 4 corner + 4 edge + rotate, native handle hidden, no reflow, one undo step per
session, a width edit preserves the crop; the **centre pivot** is covered behaviourally by
*preview == committed*, not by reading the inline `transform-origin` — which is empty by design, the
pivot lives in CSS) plus `tests/cdp/verify-crop-teardown.mjs` (the crop editor
fully tears down every transient override — esp. the body veil portal — on EVERY exit path,
read back from the live computed style). Further CDP scripts cover the reveal
(`tests/cdp/verify-reveal.mjs`), the sub-menu icons/region (`verify-submodal-icons.mjs`,
`verify-submodal-region.mjs`), click-away / popup coupling (`verify-region-clickaway.mjs`,
`verify-popup-region.mjs`), crop pan hit-testing (`verify-crop-pan.mjs`) and render gaps
(`verify-render-gaps.mjs`). The **optical / black-box** layer OBSERVES the painted result + pointer
hit-tests (never CSS properties) via a reusable `_optical.mjs` CDP client — region screenshots decoded
to RGBA, a real `:hover` (CDP `Input`, since synthetic events don't trigger `:hover`), and
`elementFromPoint`: `verify-optical-render.mjs` (geometry — rotate/flip footprint, column cap, caption,
block/float/inline, both views), `verify-optical-pixels.mjs` (rotate/flip content + filter, sampled),
`verify-optical-chrome.mjs` (toolbar/sub-menu/crop-handle chrome) and `verify-resize-affordance.mjs`
(D4/D15 + the containment-lift canary). The **functional (interaction-driven)** check is
`verify-functional.mjs` — it types into the size modal and reads back the rendered width AND the
persisted source (the §4 *Resize via the size modal* item). `verify-all.mjs` runs every `verify-*.mjs`
and sums pass/fail — "test a new Obsidian version" in one command. The crop scripts **self-create** their `_crop-fixture.md`
(and delete it); the manual crop demo is `example-vault/02 — Crop.md`.

> **The load-bearing rule (the Bug 56 lesson).** A green suite must mean an **edit actually
> reaches the source and re-renders** — not merely that an isolated pure function is correct.
> The bare-key write path shipped "green" while almost nothing persisted to `{…}`, because of two
> gaps: (a) `serializeTransform` was unit-tested **in isolation**, but no test drove a toolbar
> **operation** (flip, rotate, a preset) through `modify → serialize` to assert its key lands in the
> block — so "serialize emits only `width`" went unseen; (b) the CDP checks **assumed** the render
> instead of reading the written source back. The plan therefore mandates two things that close that
> hole: **every model-mutating operation has a persistence unit test** (op → serialize → the
> key/value is present — §2.8), and **every behaviour check that performs an edit reads the actual
> source `{…}` back and asserts it** (§3 `AD1` write-path matrix), never assuming the render. A test
> that cannot fail when the write path is dead is not a verification.

---

## 2. Unit tests (Low) — per pure `*-logic` unit

Each block is a pure function set with no framework imports (`AD7`, `T8`); the test states what
each case **verifies**, not how the code does it. Files map to `implementation-plan.md` §1.

### 2.1 `renderer-logic.ts` — geometry (`AB5`)

Pure box / inner-image geometry; the single source shared by the renderer and the export
(`AD3`, `AD6`, rendering ≡ export).

- **`boxAspectRatio`** — for a 0° image the box ratio equals the intrinsic ratio (the degenerate
  case is not special, `AD3`); at 90 / 270 it is the **swapped** intrinsic ratio (w↔h), at 180
  unchanged; for a free angle it is the rotated-AABB ratio. Verifies that the **angle reflows the
  box** at edit time, never at render (`AD6`, `T5`).
- **`innerImageSize`** — the inner image's box-relative size: equal to the box for normal / flip /
  filter (fills it); for a quarter-turn the image keeps its own size, centred; for a crop the inner
  is the larger (scaled/translated) original, clipped by the box. Verifies the **box → image**
  direction and that crop is just the case with content beyond the box (`implementation-plan.md`
  §2.3). *(Pins Bug 25.)*
- **`rotatedAabb`** — the true rotated bounding box for any angle; the **single source** shared by
  the box-sizing and the canvas export (rendering ≡ export, `AD3`).
- **`estimatedBlockHeight`** — returns a synchronous, finite height estimate from the stored
  size for CM6 **block-widget** measurement (the bare-embed case), so no async measure is needed
  (`AD6`).
- **`isTallFloat` / `TALL_FLOAT_THRESHOLD_PX`** — a float whose (rotated) height exceeds CM6's
  ~250px render margin is flagged tall, from the **stored size alone** (no DOM measure). Verifies the
  tall-float cap is a pure decision driving the same `.lie-tall` stacking in **both** views (`AD6`;
  the tall-float-cap regression).

### 2.2 `live-preview-logic.ts` — line → decoration mapping (`AB9`)

- **`lineDecorations`** — a standalone image line yields one block decoration; the returned
  `params` is the attribute **content without** the `{` `}` braces. Verifies the model↔adapter
  contract that prevents the dropped-`.class` bug (`Lesson 9`; `implementation-plan.md` §4).
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
- **`toCropResult`** — composes the quantized pan / angle / scale + frame into the stored crop
  PLACEMENT transform (translate% + content-rotate + scale) plus the cut-frame **width** and an
  **`aspect-ratio`** stored only when the cut shape ≠ the original ratio (never a fixed px height,
  `AD6`). Verifies the editor emits exactly the placement + cut shape the renderer and export consume
  (`AD2`, rendering ≡ export).

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
- **Bare-key format round-trip (`T2.3`, implemented for orientation/crop/filter)** — `rotate` /
  `flip` parse to the orientation FIELDS (inner-frame, NOT the img transform), `transform` /
  `filter` to the img verbatim (a bare `transform`'s own `rotate()` stays content, not decomposed),
  `aspect-ratio` to the cut shape; a legacy `style="transform: rotate(…) scaleX(-1)"` **decomposes**
  into the orientation fields (back-compat) while a legacy crop placement stays whole. `.class`,
  `style=` and the `.lie` marker survive. Per **T2.3**, **both `width=N` and `height=N`** round-trip
  as **bare keys** for **every unit** — a pure px value drops the unit (`200px`→`200`), any other
  unit (`1.4em`, `%`, …) passes through verbatim. Layout serializes HTML-faithfully — `align=left|right`
  (float) / `align=block-*` (block) / the `.lie-inline` class (inline), reading legacy `align=center` +
  `.lie-*` (Decision 30).
  Verifies the routed-per-layer format and the orientation↔placement split (`AD2`, `AD3`, Bug 50).
- **Bug 50 regression (orientation never touches the placement)** — `setRotation` on a cropped
  transform sets `rotate` and leaves `transform` (the crop placement) byte-identical; a rotated crop
  round-trips with both the orientation field and the placement intact. Verifies the structural
  pivot that designs out the rotate-a-crop drift.
- **Brace-stripping (`Lesson 9`)** — when given content **with** braces the leading `.class` token
  is lost, but the model's own entry point strips them, so an end-to-end parse keeps the leading
  class. Verifies the contract pitfall is guarded at the unit boundary (`implementation-plan.md`
  §4).
- **`nonDefaultFilter`** — reduces a `FilterData` to its non-default keys (the single "≠ default"
  predicate shared by `filterToCss`, `isDefaultFilter` and the filter panel's commit). Verifies the
  filter is persisted/serialized as only its non-default keys (`F11`).
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
  `Lesson 5` pitfall is guarded; falls back to leaving the link as-is on any failure
  (`implementation-plan.md` §3.1).

### 2.8 Per-operation persistence (`transforms.ts` + the op layer) — the Bug 56 guard

Beyond the isolated round-trip (§2.6): **each** model-mutating operation, applied to a base
transform, must serialize to a `{…}` that **contains its key/value** — the unit that would have
caught Bug 56 (only `width` ever emitted). One assertion per op (and each also **round-trips**:
serialize → parse → the op's field is back):

- **`setRotation` (90 / 180 / 270 / free)** → `rotate=` present with the angle; back to 0 → absent.
- **`toggleFlipH` / `toggleFlipV`** → `flip=horizontal` / `vertical`; toggled off → absent.
- **`setFilter(...)`** → `filter="…"` with the non-default values; all-default → absent.
- **layout (each of the six states)** → float `align=left|right`, block
  `align=block-left|center|right`, inline the `.lie-inline` class; reset → absent (legacy
  `align=center` / `.lie-*` still read, Decision 30).
- **preset width (small / medium / large) via `setWidthPx`** → `width=N` (the baked px);
  **`original`** → absent. *(Pins the "small preset does nothing" symptom.)*
- **`addClass`** → the class in `.class`.
- **crop `toCropResult`** → `transform=` placement (+ `aspect-ratio=` only when shape ≠ original).

Verifies that **every** op persists, not just `width` (`AD1`, `T2.3`; pins **Bug 56**, supports
**Bug 51**).

### 2.9 `image-resolver.ts` — source↔DOM resolution (`AB3`)

- **`findImageInText(text, src, occurrence)`** — resolves the **occurrence-th** embed of a basename
  in source order; the 2nd occurrence of a repeated file resolves to the 2nd source line (NOT the
  first basename match), defaults to the first, returns null past the last, and counts occurrences
  across both link forms in column order. Verifies the position-exact reading-view resolution
  (`F2`; fails on the old first-match behaviour). *(The module is pure via `import type` Editor.)*

### 2.10 `size-submenu-logic.ts` — size presets (`AB14`)

- **`sizePresets`** — `icon` sets a **line-height height only** (no width); `small`/`medium`/`large`
  bake the configured px width (no height); `original` clears both. Verifies that **size is set
  independently of layout** (`F24`, Decision 30 / Change 38): a preset carries **no** `inline` flag —
  the inline rendering is the separate **inline layout state** (`F15`/`F17`). Fails if a preset's
  width/height is not set/unset as expected, or if a preset re-introduces an inline flag.

### 2.11 `render-core.ts` — runtime identification (`AB7a`)

- **`CLAIM_SELECTOR`** — claims every runtime-only key (`rotate`/`flip`/`transform`/`aspect-ratio`/
  **`filter`**) + their `data-` variants and the `.lie` marker, **the non-native layout states**
  (`.lie-inline`, `[align="center"]`, `[align^="block-"]` + `data-` variants, Bug 76), **and a
  `width`/`height` carrying a non-px unit** (em/%/… — no faithful HTML attribute, runtime-only). It
  does **not** claim the native-faithful `align=left|right` (float) or a **pure-px** `width`/`height`
  alone (the browser floats / sizes those itself). Verifies a bare `filter=`, a block/center/inline
  image **and** a unit-sized image are hydrated off-Obsidian (`F25`/`T3`/`T2.3`/`F15`); fails if any
  non-native key, layout, or unit-size is dropped.

---

## 3. Integration tests (Mid) — one per load-bearing decision

One test per architecture decision (`AD1`–`AD9`), each confirming the decision **holds when
wired into the running app**. These are **not** unit-testable (CM6 / Obsidian are required) and
run via CDP eval against the example vault (`Lesson 6`, `AD7`).

- **AD1 — Source is the single source of truth.** Apply an edit (e.g. rotate), read the source
  line back, confirm it serialized into the trailing block; switch reading view ↔ live preview
  and confirm the render reflects the **source**, not a cached state; confirm no second store
  exists (the only mutation path is the source). *Verifies: no stale render survives a mode
  switch or reused embed (`F2`).*
  - **Write-path persistence matrix (MUST actually run — read the source, never assume; Bug 56).**
    In the running vault, perform **each** op and **read the real source line `{…}` back**,
    asserting its key landed — then confirm the re-render reflects it: rotate cw / ccw, flip h / v,
    each filter, **each layout state** (float-left/right, block-left/center/right, inline), each size
    preset (icon/small/medium/large/original), add-class, crop accept, reset. The native resize handle's `width` **and** every
    toolbar/menu op must persist. *This is exactly the check Bug 56 slipped through (only `width`,
    via the handle's separate path, persisted) — the CDP step must read the written source, not
    assume the DOM changed. Pins **Bug 56**.*
- **AD2 — Declarative per-layer routing, verbatim.** Confirm each datum lands on its layer
  (target, §2.3): `align` / `width` / `aspect-ratio` / `style` / `.class` on the **outer**,
  `rotate` + `flip` on the **inner-frame**, the crop `transform` + `filter` on the **`<img>`** — by
  key, with `transform` / `filter` contents passed through unparsed (a hand-authored `skew()` or
  extra filter survives on the rendered img). *Verifies the contract is applied verbatim, no value
  parser (`T2`, `T3`, `F25`).*
- **AD3 — Uniform 3-layer box, outer→image direction.** Confirm normal, rotated, flipped, cropped,
  filtered and sized images all have the **same** embed → outer → inner-frame → `<img>` structure
  (no `display:contents`, no per-state fork), and that the **outer** carries the footprint
  (width/aspect, never rotated) while the inner-frame orients and the `<img>` follows. Confirm
  re-orienting (inner-frame) leaves the crop placement on the `<img>` untouched, and `flip`-inner ∘
  `rotate`-frame reaches all eight orientations. *Verifies the uniform 3-layer element and one
  sizing direction (`T5`).*
- **AD4 — Two adapters, one DOM.** Render the same image in reading view and live preview;
  diff the produced DOM structure and the resulting box / img sizes. *Verifies both adapters
  produce the same structure and visual result (`T4`, `F4`).*
- **AD5 — Uniform widget + CSS-suppress / one path per mode / inline same widget.** Confirm the
  live-preview widget does **not** replace the standalone line (the text stays intact, so Obsidian's
  native embed still loads the image and reveals the source), the plugin draws its **own** transformed
  image, and the native image is suppressed by static **uniform** CSS (`> img` *and* `> .image-wrapper`
  hidden in **every** embed, the plugin's own `.lie-wrapper` never). Confirm the **three render modes**
  (the rework's CDP points, against the example vault):
  - **`{…}` standalone → inline widget in its own non-BFC cm-line.** A `lie-left`/`lie-right` float
    **escapes** into `.cm-content` and wraps the following hard-wrapped cm-lines (real **multi-line
    wrap**, `F18`); per line `CMtop==DOMtop` and `CMh==DOMh` (**zero height desync**); `posAtCoords` on
    wrap text maps to the correct line (**no click-steal**); `elementFromPoint` over the image is the
    `IMG` (clickable via `z-index:1`).
  - **bare `![](…)` → `block:true` widget.** The block-promoted line shows the plugin's own block
    widget (CDP: a real height, not a blank ~6px line), next to the image-suppressed native embed.
  - **inline mid-text → the same widget** in inline mode (`Decoration.replace`), same uniform chrome —
    only the placement differs (`AB9`, `F17`); no `{…}` shown as text.
  Confirm the `{…}` is real document text CSS-**hidden** when rendered and shown when the line is active
  (`.cm-active` / `.cm-line:has(> .cm-formatting)`); confirm the reveal-for-looking is a display-only
  "fake" raw link painted by the plugin, shown by CSS in **auto** mode (cm-line hover / active line) or
  **always** mode (the `alwaysShowLink` setting), and **dismissed** per image by the `<>` toggle
  (a `.lie-dismissed` line class that auto-clears in auto mode) — **no reactive JS**, no third "hidden"
  mode. *Verifies one owning path per mode, no double render, the native embed embraced and
  CSS-hidden (`F3`, `F8`, `F17`, `F18`, `T6`).* *To verify (`DEC-6`): that `.cm-active` flips in
  lock-step with Obsidian's native source-reveal, with the native-widget-DOM `:has()` fallback.*
- **AD6 — Declarative sizing, no measure loop.** Confirm a rotated image converges to the
  stored bounding-box size with **no** render-time measure/retry — including with a cached image
  and a backgrounded window (animation frames throttled). *Verifies sizing is box→image at edit
  time, designing out the rotated-box drift (`T7`).*
- **AD8 — Shared sub-menu host.** Open crop, filters and resize; confirm each opens through the
  **one** host — greyed toolbar, icon **reset / cancel (✗) / accept (✓)**, **Esc=cancel** (discard,
  no source write) / **Enter=accept**, open/close toggle — and that only **placement** differs by
  size. Confirm ✗/Esc discards (no write, live DOM restored) while ✓/leave persists once; and that
  image + toolbar + panel form one active region (toolbar+panel show/hide together). *Verifies the
  single component, not per-feature reimplementation (`F14`, `D6`); pinned by
  `tests/cdp/verify-submodal-icons.mjs` + `tests/cdp/verify-submodal-region.mjs`.*
- **D6.2/D6.3/D6.4 — Region visibility coupling (Bugs 62–64).** ONE signal drives toolbar visibility,
  staying-greyed and panel/palette visibility — never the CSS `:hover` competing with the JS region
  state. Confirm: (1) an active click OUTSIDE the region closes+persists filter/size but leaves an
  in-place **crop** session untouched (no write); (2) the bar stays **greyed the whole** time a panel
  is open (shown=opacity 0.4, hidden=0, never un-greyed); (3) the folded-group popup / class dropdown
  keep the bar visible while hovered (NOT greyed) and close together with the bar on region-leave.
  *Pure: `clickDismissesToolbar` (`tests/unit/toolbar-region-logic.test.ts`). CDP:
  `tests/cdp/verify-region-clickaway.mjs` (Bug 62), `tests/cdp/verify-submodal-region.mjs`
  (Bug 63), `tests/cdp/verify-popup-region.mjs` (Bug 64). The region hover travel is driven by a **real
  CDP pointer** (`Input.dispatchMouseEvent` via `_optical.mjs`) — synthetic `MouseEvent`s can't drive
  the binder's real `:hover`/`pointer-events` path, so they would both **false-red** the leave checks
  AND **false-green** the "still active" ones (the region never actually moved); the real pointer makes
  both honest. Only the floating-bar-outside-the-image travel may still want a manual confirm.*
- **AD9 — Platform reuse.** Confirm captions render via Obsidian's `MarkdownRenderer`, resize
  uses the native handle/frame, the column cap reads `--file-line-width`, link conversion calls
  `fileManager.generateMarkdownLink`, and i18n follows Obsidian's locale. *Verifies the platform
  is the building block, not a parallel reimplementation (`F5`, `F22`, `F21`, `D4`).*

- **AB7a — Portable runtime & fallback degradation (IMPLEMENTED).** On a plain page (no Obsidian) —
  the `tests/runtime-smoke.html` fixture, verified in a real Chromium engine via an isolated iframe (no
  Obsidian markdown):
  - **Hydration** — the runtime claims the right images and builds the **3-layer** structure
    around each via the shared `buildLayers`, injecting `RENDER_CSS` (CSS-in-JS) + a runtime
    alignment rule. *Verifies one shared builder hydrates a foreign page (`T3`, `T5`). ✓ via
    `tests/runtime-smoke.html` (browser fixture; an automated CDP runner is still TODO).*
  - **Identification** — an `<img>` is claimed **iff** it carries a distinctive key
    (`rotate`/`flip`/`transform`/`aspect-ratio`) or `.lie`; an `align`-only / `width`-only /
    `style`-only / `class`-only image is **not** claimed (no runtime structure built). Both the
    bare and the `data-`-prefixed Pandoc variants are recognized. *Verifies the claim rule (`T3`). ✓ via
    `tests/runtime-smoke.html` (browser fixture; an automated CDP runner is still TODO).*
  - **Fallback degradation per key (no runtime, no plugin)** — with neither plugin nor runtime:
    `align` and `width` (and a `style="filter:…"`) render **faithfully** (real HTML attrs); `rotate`,
    `flip` and the inner crop `transform` are **inert and the original, untransformed image still
    shows** (`F25`); a kramdown/Jekyll page (the bare brace never reaches the DOM) shows the plain
    original. *Verifies the never-emit-plugin-only-Markdown baseline (`F25`, `T3`) — comment out the
    runtime `<script>` in `tests/runtime-smoke.html` to confirm.*
  - **Import discipline** — the runtime bundle pulls **no** obsidian/CodeMirror (the runtime esbuild
    entry has no `obsidian` external, so a stray import fails the build). *Verifies the Obsidian-free
    core (`T3`, AB7a).*
  - **Caption off-Obsidian (Feature 41 / Decision 31).** On a foreign page (no Obsidian, no
    `MarkdownRenderer`) a claimed image with alt text gets its caption rendered by the runtime's
    **own** minimal inline-Markdown renderer (bold / italic / code / link), in a shrink-wrap host
    sized to the image width by CSS alone (`D9`, no JS width-sync); the HTML is built **without
    `innerHTML`** (parsed + grafted, Bug 110). Fidelity is bounded by the lossy `alt` attribute.
    *Verifies the AD9 runtime exception (`F22`, `AD9`).*

- **Format migration (width/align → bare keys) — IMPLEMENTED.** Render parity (CDP): a new
  `align=`/`width=N` image and the legacy `.lie-left`/`style="width:…"` form render identically
  (same float/centre/width); the renderer re-derives the marker class from the `align` field.
  Round-trip + back-compat are unit-tested (`transforms.test.ts`). *Verifies the bare-key writer +
  legacy reader (`T2.3`, `F15`, `F24`).*

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
- **Resize affordance (`D4`, `D15`).** On hover or when the image is selected, the **selection
  frame and the native resize handle are both visible** (the handle resizes). **While cropping the
  selection frame stays visible** — outlining the resulting cropped image so its location is always
  shown — **while the resize handle is absent and inert**, and the **dimmed surround outside the cut
  window is visible** (the surrounding context shows through, dimmed). Verified black-box: the running app is
  observed for the frame / handle / overflow actually being visible or absent, independent of any
  specific CSS. Pinned by `tests/cdp/verify-resize-affordance.mjs` — hover → the handle is grabbable
  (`elementFromPoint`) and the selection frame is painted (a hover/no-hover pixel diff); crop → the
  handle is inert, an accent frame still outlines the cut, and the **dimmed surround is painted AND
  hit-testable outside** the cut window (a drag there still pans the image) — the **veil-portal canary**:
  a missing/inert surround = the body portal failed to escape containment or carry the pan hit-surface.
- **Affordances are observed VISIBLE, not merely present (`D4`, `D8`, `D15`).** Every editing
  affordance — the **resize handle and its marker**, the **selection frame**, and the **crop
  corner / edge / rotate handles** — is checked by **pixels** for being actually *painted*, not only by
  `elementFromPoint` for being *hit-testable*. A handle that is present and grabbable but visually
  **clipped / not fully painted** (e.g. a containment clip eating the half that sits outside the image
  or cut window) is a **FAIL** — hittability alone is insufficient. This is the load-bearing rule for
  the affordance checks, the resize-handle analogue of the Bug 56 "never assume the write" rule. The
  marker check covers the layouts that actually trigger the clip: a **block-layout** image (tall-float
  / bare-embed, paint-contained by the block widget) — the native marker stays **fully painted, not
  clipped**; and a **captioned** image — the handle anchors to the **image** corner, not the caption's
  bottom (Bug 99/107). Pixel-observed, independent of the mechanism that prevents the clip.
- **Filters (`F11`, `D7`).** Each slider (brightness, contrast, saturate, hue, blur, grayscale,
  sepia) changes the image live; named presets apply; double-click resets a slider; the panel docks
  on the roomier side and hides when the image scrolls out of view.
- **Export (`F13`).** Exported file reproduces all transforms + filters **exactly as displayed**
  (rotation → rotated output, crop → clipped output, filters baked in); the save offers the
  native dialog at the original folder with a free `{name}-{n}` pre-filled and never overwrites
  silently (native dialog verified manually — not CDP-reachable, §6). A denied/failed vault write
  surfaces an error notice, never silently swallowed (Bug 89).
- **Captions (`F22`, `D9`).** Alt text renders as a Markdown caption below the image (bold /
  italic / code / links formatted), centred, muted, **never wider than the image** (long caption
  wraps within the image width), tracking the image through resize / column change; width
  follows the **visible** box (rotated/cropped → visible cut width); toggle off by default;
  too-small images show the caption on delayed hover (`D9.1`).
- **Layout — six states (`F15`, `F18`, Decision 30).** The six mutually-exclusive states —
  **block-left / center / right** (own line, no text wrap), **float-left / right** (text wraps the
  side), **inline** (within a text line) — each render correctly in **both** views; reset restores the
  default. Exactly **one** of the six toolbar controls is highlighted, matching the image's current
  state. Layout is **independent of size** (`F24`) and decoration classes (`F16`). Block vs float is
  observable by whether surrounding text wraps beside the image (float) or sits above/below it (block);
  a block-aligned image keeps its source on one line in live preview (Bug 78).
- **Classes & snippets (`F16`, `F24`).** Size presets (icon/small/medium/large/original) apply via the
  width mechanism; vault-snippet classes are discovered, offered, individually de-selectable, and
  refresh on change; bundled example snippets install opt-in and reset to shipped (`F16.1`). (The
  built-in layout states are the **Layout** item above, not classes.)
- **Resize via the size modal — functional (`F24`, `D6.1`, `AD1`).** Driving the modal as a user:
  typing a **width** re-renders the image to it (live) and **persists `width=N`** to the source; typing
  **width AND height** persists both (the explicit custom-size path, `T2.3`); **clearing** the fields
  removes the size and the image widens back to its responsive default (Bug 42). The interaction is
  driven (field input + commit) and both the rendered width and the written `{…}` are read back.
- **Link form (`F5`, `F6`).** Toggling Obsidian's *Use [[Wikilinks]]* converts the link while the
  trailing block stays intact; a Markdown native size folds into the block; a wikilink native
  size is left as written. A native pipe / Markdown size is folded into the rendered width in **both**
  views (the `{…}` block wins), and an actual edit normalizes it into the block, off the pipe (Bug 94).
- **Change image source (`F26`).** Swapping one embed's file keeps the `{…}` block **and** the caption
  (alt) — only the link target changes, so the new image inherits the existing transforms. There is
  **no link-swap "replace all"** (a note-wide replace means baking → the flatten path, not this).
- **Inline images (`F17`).** An image mid-sentence renders at its inline size in both views — not
  Obsidian's native full-size inline image — through the **same** uniform widget and chrome
  as standalone (only the placement differs), with no `{…}` shown as text.
- **Float & wrap (`F18`).** The **float-left / float-right** states float the image and the
  surrounding text wraps around it in both views, including the hard cases (rotated + float + wrapped, cropped +
  float + wrapped), verified by measuring actual line-box rects (not the full-width border box). In
  live preview the float is the inline widget in its own non-BFC cm-line that **escapes** into
  `.cm-content` (multi-line wrap on hard-wrapped paragraphs, **zero height desync** per line, **no
  click-steal**, image clickable via `z-index:1`). A float taller than ~250px **stacks as a
  non-floated block in BOTH views** under the *Stack tall floated images* setting (default permissive — off), so
  it can't derender on scroll in LP and the reader matches it (`tallFloatSafe`; the tall-float cap).
- **Settings (`F20`, `D11`, `D14`).** General toggles (hover toolbar, captions, default reveal state,
  button-outlines Auto/Always/Never), preset widths, snippet list with per-class toggles and
  install/reset, and editing-toolbar integration all take effect live; edits never jump scroll, and a
  single-image edit places the caret on its image's line (`D11` revised) — keeping undo anchored there —
  while hovering never moves the cursor (Bug 77/108).
- **i18n (`F21`).** Switching Obsidian's locale switches the plugin's strings (reusing platform
  strings where available) with English fallback; the filter panel widens so translated labels
  fit, never clipped (`D6`).
- **Toolbar & sub-menu UX (`F7`, `D1`–`D2`, `D6`).** The toolbar appears on selection and hover,
  sits inset at the top (above the image when too small, `D1.1`), follows the defined order, and
  wraps at dividers on overflow; every sub-menu is fully visible, never clipped or internally
  scrolled, and the image + toolbar + open panel form one continuous active region.

---

## 5. Regression tests — one per fixed bug + per learned lesson

A regression test pins each entry once it is fixed (the solved `Bug N` entries in `CHANGELOG.md` + the `T-Ln`
lessons in `issues.md`). Pure-logic regressions become **unit** tests (§2); the rest are **CDP** checks (§3/§4).

### 5.1 Per fixed bug (`CHANGELOG.md` solved `Bug N` entries)

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
| Bug 9 | Custom-size sub-menu has width **and** height fields | CDP (`D6.1`) |
| Bug 10 | Alignment classes float the embed (`:has()` on the container) | CDP (`AD3`) |
| Bug 11 | Native resize **handle** shown on hover, **hidden** while cropping (`D4`); the **selection frame** shows on hover/selection and **stays visible while cropping** (`D15`) | CDP (`D4`, `D15`) |
| Bug 12 | Export never overwrites silently (superseded by the save dialog) | CDP (`F13`) |
| Bug 13 | ~~Revealed link editor is borderless~~ — **obsolete**: there is no plugin-owned editable field anymore; editing is native document text (Obsidian's own cursor-reveal), so `D5`'s borderless requirement is satisfied natively | n/a (`D5`) |
| Bug 14 | No-size image fits the column, no overflow | CDP (`D3`) |
| Bug 15 | Resize frame hugs the image (zeroed wrapper padding) | CDP (`AD3`) |
| Bug 24 | Standalone classes reach the img in live preview — **brace-stripping** | **unit** (`live-preview.test.ts`) + CDP (`Lesson 9`) |
| Bug 25 | Resized crop has no empty band — `innerImageSize` aspect-correct | **unit** (`renderer-logic.test.ts`) + CDP |
| Bug 26 | Inline mid-text image uses the same widget in inline mode, not native | **unit** (`inlineEmbeds`) + CDP (`F17`, `AD5`) |
| LP float cluster | `lie-left/right` wraps multi-line via the inline non-BFC widget escaping into `.cm-content` — 0 height desync, 0 click-steal, image clickable (`z-index:1`) | CDP (`AD5`, `F18`) |
| Tall float | a float taller than ~250px stacks as a non-floated block in **both** views (no LP derender on scroll) | **unit** (`isTallFloat`) + CDP |
| Bare embed | a bare `![](…)` line renders the plugin's `block:true` widget (a real height, not a blank line), native image CSS-suppressed | CDP (`AD5`, `Lesson 14`) |
| Inline-icon / tiny toolbar | the floating bar sits truly ABOVE a too-small image (`rect.top − h − gap`, below-fallback near the viewport top); float-out fires by coverage | CDP (`D1.1`) |
| Bug 50 | rotate/flip of a cropped image rides the inner-frame (centre pivot) and never touches the `<img>` crop placement — no drift; export composes content → orient the same way | **unit** (`transforms` setRotation-on-crop, `crop-editor-logic`) + CDP (`AD3`, the 3-layer geometry) |
| Bug 56 *(SOLVED — basename-collision in the source resolver; fixed via DOM-position resolution)* | **every** toolbar/menu op persists to `{…}`, not only `width` — the per-op persistence matrix + the read-source-back behaviour check | **unit** (§2.8) + CDP (§3 `AD1` write-path matrix) |
| Bug 51 *(SOLVED — migrated to the live 3-layer model)* | crop editor on the **live 3-layer** structure: centre origin, handles on the inner `<img>`, the frame/box stays fixed, the overlay image rotates, a `width` resize **preserves** the crop, and the crop/rotate edits **persist** to `{…}` | **unit** (`toCropResult` / §2.8) + CDP (`AD3`, `D8`) |
| Crop pan hit-area *(SOLVED)* | the pan grip is the **whole visible image** — the dim ghost img is the pan hit-surface (`pointer-events:auto`), so a drag started **outside** the cut frame pans too, while the handles still win their own hits | CDP (`D8`; `tests/cdp/verify-crop-pan.mjs` — real `elementFromPoint` hit-test) |
| Bug 53 *(SOLVED)* | the reveal toggle shows the **`<>` (code)** icon, not an eye | CDP (`F8`); `tests/cdp/verify-reveal.mjs` |
| Bug 54 *(SOLVED)* | a `<>` dismiss hides the **whole** raw embed (fake `![](…)` + `{…}`), not just `{…}`; the dismiss/auto-clear state machine resets only on *leave* (a fresh dismiss survives its own tx) | **unit** (`reduceReveal`, `tests/unit/regressions.test.ts`) + CDP (`F8`, `F3`; `tests/cdp/verify-reveal.mjs`) |
| Bug 55 *(SOLVED)* | the revealed `{…}` attribute list keeps its **CM syntax highlighting** (URL tokens), via a single `URL_CLASS` mark that carries **no** `cm-formatting` | **unit** (`URL_CLASS` invariant, `tests/unit/regressions.test.ts`) + CDP (`tests/cdp/verify-reveal.mjs`) |
| Bug 76 | A block/center/inline image (no faithful HTML rendering) is **claimed** so it renders off-Obsidian; `align=left/right` float stays unclaimed | **unit** (`CLAIM_SELECTOR`, §2.11) + CDP (`T3`, `F15`) |
| Bug 77 | Undo after a toolbar edit **stays on the image** — the edit seeds the caret on the image's line, so cmd+Z does not scroll to the document top (`D11` revised) | CDP (`D11`) |
| Bug 78 | A block-aligned image (`align=block-*` / legacy center) keeps its source on **one** line in live preview (block layout styles the plugin widget, not the suppressed native embed) | CDP (`AD5`, `F15`) |
| Bug 89 | A failed/denied vault write during Export surfaces an **"Export failed" notice**, never silently swallowed | CDP / manual (`F13`) |
| Bug 90 | Rotating an explicitly-sized image **swaps the footprint** (w↔h) instead of stretching the height | **unit** (`rotatedFootprint`, renderer-logic) + CDP (`AD3`, `AD6`) |
| Bug 91 | Decoration/snippet classes + the layout markers ride the **outer box**, not the `<img>` — an outset box-shadow / border is not clipped | **unit** (render-core `applyClasses`) + CDP (`AD2`, `AD3`, Decision 28) |
| Bug 92 | Editing chrome is **live-preview only** — a touch long-press in reading view opens no toolbar | CDP (`F7`, Decision 22) |
| Bug 93 | The plugin follows Obsidian's locale **even when Obsidian is set to English** (`detectLocale` mirrors `getLanguage`) | **unit** (i18n `detectLocale`) + CDP (`F21`) |
| Bug 94 | A native pipe/markdown size (`![[img\|160]]`) is **folded into the render width in both views** (the explicit `{…}` block wins); an edit normalizes it into the block, off the pipe | **unit** (`applyNativeSize` / `foldNativeSize`) + CDP (`F6`, `T2`) |
| Bug 96 / 100 / 106 | Raw-link reveal is correct for **inline / list / callout** embeds: link shown **once** (no double), the `{…}` syntax-highlighted, never a stray `{…}` with no link | CDP (`F8`, `AD5`; `verify-reveal.mjs`) |
| Bug 107 | With a caption the resize handle anchors to the **image corner**, not the caption's bottom | CDP (`D4`, `D9`) |
| Bug 108 | Resizing via the **hover handle without a prior click** keeps cmd+Z on the image (resize write passes the `D11` cursor) | CDP (`D11`) |
| Bug 109 | The link-source reveal **stays put during a crop** (hover reveal suppressed on a cropping line) | CDP (`F8`, `D8`) |
| Bug 110 | The standalone runtime renders the caption **without `innerHTML`** (DOMParser + `replaceChildren` on escaped HTML) | **unit** (`runtime-markdown`) + CDP / manual (off-Obsidian) |

### 5.2 Per learned lesson (`T-Ln`, in `issues.md`)

| Lesson | Regression it guards | Level |
|---|---|---|
| `Lesson 1` | An un-replaced line re-fires Obsidian's native embed and shows `{…}` as text — the still-true observation that now **motivates** the model: embrace the native embed (it loads the image + reveals the source) and CSS-hide both the native image and the `{…}` when rendered | CDP (`AD5`) |
| `Lesson 2` | StateField (block + inline decorations) drives the widget, not a ViewPlugin | CDP (`AD5`) |
| `Lesson 3` | Transforms stored **only** in the trailing block (never alt / pipe) | unit (`transforms`) + CDP |
| `Lesson 4` | Never `disablePlugin` via CDP — diagnostic constraint, not a test | n/a (process) |
| `Lesson 5` | Link conversion never uses the `alias` arg | **unit** (`link-format.test.ts`) |
| `Lesson 6` | Decision logic tested pure, not by CDP — the §2 split itself | unit (structural) |
| `Lesson 7` | One DOM structure for every image | CDP (`AD3`) |
| `Lesson 8` | One render path per mode, no double render — the plugin's widget is the only painted image, Obsidian's native image **uniformly** CSS-suppressed (and the reading-view reconcile skips widget-owned embeds) | CDP (`AD5`) |
| `Lesson 9` | `params` brace-less before `parseAltText` | **unit** (`transforms` + `live-preview`) |
| `Lesson 10` | No reliance on rAF/ResizeObserver alone — designed out by `AD6` (box→image, no measure loop) | CDP (`AD6`, `T7`) |
| `Lesson 11` | The LP adapter never replaces the line; a `{…}` embed renders as an **inline** widget in its own non-BFC cm-line (float escapes → wrap), the native image uniformly CSS-hidden | CDP (`AD5`, `F18`) |
| `Lesson 12` | Obsidian keeps the embed rendered even on the active line; only the trailing `{…}`/alt become editable text — native editing covers the plugin's data | CDP (`AD5`) |
| `Lesson 13` | `container-type: size` on the box works, but collapses to 0×0 when the box's pane is `display:none` — measure in the visible pane | CDP (process) |
| `Lesson 14` | A **bare** embed needs no `{…}`: it renders via a `block:true` widget (block-promotion irrelevant), native image suppressed — no normalization, no marker | CDP (`AD5`) |

> `Lesson 10` was the *workaround* for an imperative measure-then-resize loop; `AD6` removes that
> loop entirely (sizing is box→image, declarative), so the regression check is that **no
> render-time measure/retry exists**, verified under a backgrounded window (`T7`).

---

## 6. What is NOT unit-testable (CDP-only)

Per `Lesson 6` and `AD7`, anything that needs the live framework cannot be a vitest unit and is
verified only by CDP eval in the running app (or, where noted, manually):

- **CM6 decoration & widget behaviour** — the three widget modes with the line left intact: the
  **inline** standalone widget in a `{…}` embed's own non-BFC cm-line (float escapes → wrap), the
  **`block:true`** widget for a bare/block-promoted embed, and the **`Decoration.replace`** widget for
  a mid-text inline icon — uniform chrome, placement differs only; the StateField rebuild on
  docChange / selection / mode toggle / `<>` dismiss (`@codemirror` does not resolve under vitest).
- **Obsidian embed rendering** — that an un-replaced line re-triggers Obsidian's own native
  embed (the basis for `AD5`'s widget + uniform CSS-suppress model: the native embed is embraced for
  the image load and the source cursor-reveal, then CSS-hidden), reconcile skipping widget-owned
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
