# Implementation Plan — Live Image Editor

> The implementation artifact — the **Low-level concept** from `methodology.md`: *how the
> architecture is built in code*, concretely. It records the files, exported functions/classes,
> the concrete data representations, and **which realization is used** — plus the realization
> pitfalls (the regression guards each architecture decision translates to in code).
>
> Derived **from** `architecture.md`: references point **up** to its decisions (`ADn`) and
> building blocks, and through it to `requirements.md` (`Fn` / `Dn` / `Tn`). Names reflect the
> current code. This records the **target state** (what is implemented), not a sequence of
> edits; a change that alters the target simply updates this definition.

---

## 1. Module map

One file per building block where possible; pure decision logic split into a sibling
`*-logic.ts` (AD7), unit-tested under `tests/`.

| File | Building block (arch §4) | Key exports |
|---|---|---|
| `src/main.ts` | AB17 Lifecycle | `Plugin` subclass |
| `src/transforms.ts` | AB1 Transform model | `ImageTransform` *(classes/inline; orientation: rotate/flipH/flipV → inner-frame; content: transform/filter → img; footprint: width/height/aspectRatio/box → outer)*<br>`FilterData`<br>`parseAltText` *(bare keys + legacy `style=` back-compat)*<br>`serializeTransform` *(bare keys)*<br>`getRotation`/`setRotation` *(the orientation field)*<br>`toggleFlipH`/`toggleFlipV`/`getFlipH`/`getFlipV` *(fields)*<br>`isCrop`<br>`getFilter`/`setFilter`/`filterToCss`/`parseFilterCss`<br>`getWidthPx`/`getHeightPx`/`getPreset`/`setPresetWidth`/`setWidthPx`/`setHeightPx`<br>`temperatureAdjust` *(dead — see DRY audit)*<br>`MARKER_CLASS` *(backward-compat parse-skip only)*<br>`INLINE_CLASS` |
| `src/link-format.ts` | AB2 Link form & native-size normalization | `parseEmbedLine`<br>`buildEmbed`<br>`convertEmbedLine`<br>`desiredFormat` |
| `src/image-resolver.ts` | AB3 Source↔DOM mapping | `findImageInSource`<br>`findImageInText`<br>`getImageFilename`<br>`parseLocationTransform` *(dead — see DRY audit)* |
| `src/source-writer.ts` | AB3 / AD1 edit writer (shared) | `writeSource` *(one isolated CM transaction per edit)*<br>`LIE_USER_EVENT` |
| `src/snippet-scanner.ts` | AB4 Snippet class discovery | `scanSnippets` *(enabled-only)*<br>`SnippetClass`<br>`installBundledSnippet`<br>`resetBundledSnippet`<br>`isBundledSnippetInstalled` |
| `src/renderer-logic.ts` | AB5 Geometry (pure) | `boxAspectRatio`<br>`innerImageSize`<br>`rotatedAabb`<br>`estimatedBlockHeight`<br>`isTallFloat`<br>`TALL_FLOAT_THRESHOLD_PX` |
| `src/render-core.ts` | AB6 Uniform 3-layer box + AB7a core (Obsidian-FREE) | `buildLayers` *(the 3-layer builder, shared by plugin + runtime)*<br>`applyFilterPreview`<br>`unwrapBox`<br>`BOX_CLASS` *(outer)*<br>`FRAME_CLASS` *(inner-frame)*<br>`RENDER_CSS` *(structural layer CSS, the single injected source)*<br>`CLAIM_SELECTOR`/`readTransform` *(identification + attrs→model)* |
| `src/caption-logic.ts` | AB7 Caption (text, pure) | `captionMarkdown`<br>`captionFromAlt` |
| `src/caption.ts` | AB7 Caption (DOM) | `createCaption`<br>`CaptionHandle` |
| `src/live-preview-logic.ts` | AB9 LP line→decoration (pure) | `lineDecorations`<br>`inlineEmbeds`<br>`rewriteWidth`<br>`EMBED_LINE` |
| `src/live-preview.ts` | AB9 Live-preview adapter (+ AB16 widget + CSS native-suppression) | `createLivePreviewExtension`<br>`refreshDecorations`<br>*(internal: `WidgetMode = block\|inline\|standalone`, `RevealMode = auto\|always`)* |
| `src/toolbar.ts` | AB10 Toolbar | `ImageToolbar`<br>`buildToolbarElement` |
| `src/anchored-submenu-logic.ts` | AB11 Sub-menu placement (pure) | `placeSubmenu`<br>`SubmenuPlacement` |
| `src/anchored-submenu.ts` | AB11 Shared sub-menu host | `AnchoredSubmenu` |
| `src/crop-editor-logic.ts` | AB12 Crop quantization (pure) | `snapTranslate`<br>`snapAngle`<br>`snapScale`<br>`toCropResult` *(placement transform + cut width + aspect-ratio ≠ original)* |
| `src/crop-editor.ts` | AB12 Crop editor | `CropEditor` |
| `src/filter-panel.ts` | AB13 Filter panel | `FilterPanel` |
| `src/size-submenu.ts` | AB14 Size sub-menu | `buildSizeBody`<br>`SizeState` *(CSS-string width/height)* |
| `src/export.ts` | AB15 Export | `renderTransformedImage`<br>`suggestExportPath`<br>`saveExport` |
| `src/commands.ts` | AB18 Commands | `registerCommands` |
| `src/settings.ts` | AB19 Settings | `LieSettingTab`<br>`LieSettings` *(alwaysShowLink, presetWidths, tallFloatSafe)*<br>`DEFAULT_SETTINGS` |
| `src/styles-injector.ts` | AB20 Style injection | `StylesInjector`<br>`PresetWidths`<br>`DEFAULT_PRESET_WIDTHS` |
| `src/editing-toolbar-integration.ts` | AB22 Editing-toolbar integration | `getEditingToolbarStatus`<br>`addEditingToolbarButtons`<br>`removeEditingToolbarButtons` |
| `src/i18n/` | AB21 Localization | `index.ts`<br>`en.ts`<br>`de.ts` |
| `src/dev-bridge.ts` | AB23 Dev bridge | CDP relay (dev builds only) |
| `src/runtime.ts` | AB7a Portable runtime | second esbuild entry → `lie-runtime.js` (framework-free IIFE; `RENDER_CSS` inlined → single `<script>` include, CSS-in-JS); on `DOMContentLoaded` + `MutationObserver` it hydrates claimed imgs via the shared `buildLayers`/`readTransform`; tolerant selector `[rotate],[flip],[transform],[aspect-ratio],.lie` (+ `data-*` Pandoc variants); no `obsidian` external (import-discipline guard) |

---

## 2. Data representations

### 2.1 `ImageTransform`

The in-memory model (`transforms.ts`) is **one uniform geometry** for every image — there is no
separate crop type (R0 on the data). Fields:

- **box size** — the source carries at most `width` (user-set; optional, column-capped). **The box
  has no native auto-height**: it is always `overflow:hidden` with the image out of flow (the one
  uniform structure that also makes crop and rotation work), so it never sizes to its child — its
  vertical extent must **always be set**, as an **`aspect-ratio`** (a *ratio*), never a fixed px
  `height`.
  - **The original image's intrinsic ratio is the ground truth** — always available, never missing
    (a property of the file, T11). The auto `aspect-ratio` is **derived from it** (+ the angle, for
    rotation), **computed at render and applied to the DOM box — never written into the source**
    (writing it back would make the plugin edit the very text the user edits — the **JS-vs-editor**
    problem; DOM-only keeps the source clean: just the user's `width` + transform). It is
    width-*independent* (a manual `width` edit never fights it) and responsive, and comes from the
    **stable intrinsic** ratio, **not** from measuring the rendered box — so no measure-retry loop
    (no Bug-2).
  - **No presence check is needed — CSS precedence does it** *(CDP-verified)*. The plugin always
    applies the auto `aspect-ratio` as an **overridable default**: if the user set both `width` and
    `height` (deliberate **distortion**), CSS **ignores** the aspect-ratio (the box renders at the
    given `width`×`height`); if the user set their own `aspect-ratio`, it **overrides** the default
    (a later/own value wins). So the render does **not** parse the source to decide whether to
    apply — it sets the default and lets the cascade resolve it. An explicit `aspect-ratio` is
    **stored only for a deliberate, non-derivable aspect change**: a distorting resize, a
    width+height modal, or a **crop frame whose shape differs from the original** (a crop that keeps
    the original aspect stores nothing). It is genuine, hand-readable user intent — and being
    explicit, it overrides the derived default via the same precedence. **If it is missing**
    (hand-edited away), everything falls back to the ground-truth original ratio — image
    un-distorted, nothing breaks (T11); so crop is not a special case here either.
  - A fixed px `height` is used **only** for deliberate distortion (it would otherwise race manual
    edits *and* break the aspect on resize). Everything else is **box-relative** (§2.3).
  *(Rejected: no pure-CSS trick gives the `overflow:hidden` box an auto-height — a grid-overlay
  would need a phantom/duplicate sizing child, not worth it.)*
- **inner-image placement** — the img's **native `transform`** about its **center**
  (`transform-origin: center`): `rotate()`, `scaleX/Y(-1)` (**flip**), and — **for crop only** —
  `translate()` (pan, in **%** → box-relative) and `scale()` (zoom; shown as w/h in the editor).
  A plain rotate needs **no** `translate`/`scale`: centered rotation + the box's resize keep it in
  place. Only the `<img>` is transformed; the box stays axis-aligned.
- **filter** (`FilterData`: brightness, contrast, saturate, hue, blur, grayscale, sepia);
  `temperature` is derived (`temperatureAdjust`), not stored (F10). Plus the class list + `inline`.

The inner-image placement is **derivable for non-crop and stored only for crop**:

- *normal / flip / filter* — inner fills the box (distorted if both `width` & `height` are set),
  `translate`/`scale` identity, `rotate` 0;
- *quarter-turn* — inner keeps its size, centered, `rotate` ∈ {90, 180, 270}; no `translate`, the
  box's `aspect-ratio` is the swapped intrinsic ratio (derived at render);
- *crop* — `translate` and `scale` are **non-identity** (the explicit pan/zoom), and `rotate` may
  be **free** (any angle).

So crop is just the case that makes the otherwise-identity `translate`/`scale` explicit — no
separate `CropData`, no plugin-specific encoding; the whole placement is the one native
`transform`. `rotate` is simply an angle — not ambiguous; it applies to the **image only** (the box
stays axis-aligned, never rotated — it just resizes), and because rotation is **centered** it needs
no offset. The only convention to share is that the **CSS renderer and the canvas export apply the
same transform composition**, so the export matches the display
(F12).

### 2.2 The attribute block (the `attr_list` `{…}`)

Canonical serialization — **implemented**: a portable bare-key attribute list (T2.3, AD2), short
enough to hand-edit. The writer emits the bare keys; the parser ALSO reads the legacy forms
(`style="transform:…"`, the `.lie-left/right/center` classes, `style="width:…"`) for back-compat
(§2.2a). The keys, each routed to its layer (§2.3):

```
![alt](path.png){align=right width=240 rotate=90 flip=horizontal filter="brightness(1.2)"}
```

- **`align=left|right|center`** → the **outer**. Material syntax; left/right → legacy HTML `align`
  float (faithful float fallback even with no plugin/CSS), center → `vertical-align:middle` in the
  fallback (a harmless no-op for a block, correct for inline) with real centering done by the
  plugin's CSS on the flow host (the `lie-center` rule: full-width block + `text-align:center`, not
  `margin:auto` — Obsidian's `.cm-content>*{margin:0!important}` would beat it).
- **`width=N`** → the **outer**. Unitless px, a real HTML attribute the browser honours, ratio
  preserved; faithful fallback. **Never** with `height=` (distortion); %/responsive needs
  `style="width:…%"`.
- **`rotate=<deg>`** → the **inner-frame**. Quarter-turns + free angle. **Runtime-only** (no
  faithful native path — `transform` does not reflow); inert → original image in the fallback.
- **`flip=horizontal|vertical`** → the **inner-frame**. Runtime-only.
- **`transform="<2D-affine CSS transform>"`** → the **`<img>`**. The crop placement (pan/zoom +
  optional content-rotate) as a raw CSS transform value (a power user may write any affine
  transform). Named `transform`, not `crop` — it is a placement, not a crop. Inert on the `<img>`
  in the fallback.
- **`filter="<CSS filter>"`** → the **`<img>`**. Default key=value form; `style="filter:…"` is the
  power-user escape that stays **faithful** in the fallback. Matches `ctx.filter` in the export.
- **`aspect-ratio=<ratio>`** → the **outer**. The footprint shape; **derived** from rotate +
  natural ratio (AD6 — store only non-derivable intent), stored **only** for a deliberate crop
  shape ≠ original.
- **`.class`** → the **outer**. Built-in alignment / vault-snippet / decoration classes (F16).
- **`style="…"`** → the **outer**. The power-user escape on the visible image; the user owns its
  fallback consequences.
- **`.lie`** → optional explicit claim marker (enforce). Inert in the fallback.

#### 2.2a Legacy forms the parser still reads (back-compat)

The writer emits the bare keys (§2.2). The PARSER also accepts the earlier native-CSS forms so old
notes render unchanged; nothing is rewritten until the user next edits the image (then it serializes
to the bare keys). The legacy forms `parseAltText` decomposes:

```
![alt](path.png){.lie-left style="transform: rotate(90deg) scaleX(-1); filter: brightness(1.2); width: var(--lie-size-medium)"}
```

- **`style="transform: …"`** — an orientation-only string (`rotate`/`scaleX`/`scaleY`, no crop
  `translate`/`scale`) decomposes into the `rotate`/`flipH`/`flipV` fields; a crop placement (has
  `translate`/`scale`, incl. its content-rotate) stays whole on the `<img>`. (A BARE `transform=`
  key is never decomposed — it is the verbatim crop placement.)
- **`style="filter: …"` / `style="width: …"` / `style="aspect-ratio: …"`** → the same model fields;
  any other declaration → the `box` passthrough.
- **`.lie-left/right/center` classes** → the `align` field (the renderer re-derives the marker class
  on the img). **`.lie-img`** is skipped (`MARKER_CLASS`, never re-emitted). **`.lie-inline`** → the
  inline flag. A **preset var** (`width: var(--lie-size-…)`) is read as a non-px width and kept in
  `style=` on re-write (a new preset bakes to `width=N` px instead).
- **Crop** legacy form `style="width:320px; height:240px; transform: translate(…) rotate(…) scale(…)"`
  → the placement on the `<img>`; the renderer derives the cut shape from `width`/`height` (the bare
  form stores `aspect-ratio=` instead — §2.3). A render-time-only `lie-tall` marker is added to a tall
  float by the renderer (the tall-float cap, §2.4) and is **never written to the source**.
- **The same block trails both link forms** (T2.1 Markdown, T2.2 wikilink) verbatim; conversion
  rewrites only the link, never the block.
- **`params` handed to `parseAltText` is the block CONTENT without the `{` `}` braces.** The
  model strips them; the reading-view capture group and `lineDecorations` both pass brace-less
  content. *(Pitfall §4 — leaving the braces silently drops the leading `.class` token.)*

### 2.3 DOM layers & sizing model

Nested elements, outermost first — **the same for every image** (R0/AD3). **Implemented:** the
plugin's structure is **three layers** — `.lie-image-area` (outer) / `.lie-frame` (inner-frame) /
`<img>` — inside the flow container (`ensureLayers` in `render-core.ts` builds them and upgrades a
reused legacy 2-layer DOM).

```
embed       — the flow container: Obsidian's own .image-embed (reading view) /
              the plugin's OWN overlay container .lie-wrapper in live preview (the widget draws
              its own, while Obsidian's native .image-embed/.image-wrapper stays in the document,
              CSS-suppressed, §2.4 — keyed UNIFORMLY on the NATIVE `> img` / `> .image-wrapper`
              of EVERY embed, NEVER the plugin's own .lie-wrapper).
  ├ outer     — the FLOW PARTICIPANT / FOOTPRINT: width, aspect-ratio, align, style, .class.
  │             Reserves the (swapped) flow space; AXIS-ALIGNED, NEVER rotated (so the footprint
  │             stays correct — rotate does not reflow). Alignment/float and native vertical
  │             spacing (D10) act here.
  │   └ inner-frame — ORIENTATION + CROP CLIP: rotate + flip on ONE element (composed in written
  │   │               `{}` order); overflow:hidden.
  │   │   └ img — CONTENT: the crop placement `transform` (pan/zoom + optional content-rotate)
  │   │           and `filter`. Carries NO marker class for our own render (identified by its
  │   │           frame parent; lie-inline for an inline icon); on a FOREIGN page it is the
  │   │           claimed element (§3.6 identification).
  └ caption   — in the EMBED, BELOW the outer — NEVER inside the frame (overflow:hidden would clip
                it). Sized to the outer width by the embed itself, not by JS.
```

The `{…}` block is authored on the image, so without the plugin its keys land on the **img** (the
outer/inner-frame are built by the plugin/runtime and do not exist otherwise). With the plugin (or
the runtime) each datum is routed to the layer it must act on:

| Acts on | Values | How |
|---|---|---|
| **outer** | `align`, `width`, `aspect-ratio`, `style`, `.class` | the flow footprint, sized + aspect by the render core; align/float via `:has()` class routing |
| **inner-frame** | `rotate`, `flip`, the crop **clip** | one element, `overflow:hidden`, by the render core |
| **`<img>`** | crop placement `transform`, `filter` | the img's own `transform` / `filter` (encoding: §2.2) |

**Two sizes, one rule.** Every image has a **box** size (the visible result) and an **inner
image** size; their relation is purely a function of the transform:

- **normal / flip / filter** — equal; the image fills the box, nothing is clipped.
- **rotate (quarter-turn)** — the box is the **bounding box of the rotated image**, so changing
  the angle **reflows the box** (w↔h); the image keeps its own dimensions, rotated inside it.
- **crop** — the box is the **chosen cut frame** (the size attribute), **independent** of the
  inner image; the image is the larger (scaled/translated/**rotated**) original, clipped by the
  always-on `overflow:hidden`. Rotating the image **inside a crop does NOT change the box** — only
  what shows through the clip.

The **data model and the rendering are identical** across every case (R0) — same fields, same
box → img DOM, same CSS application. The only thing that differs is the **logic inside the pure
box-sizing function**: how it derives the box height (the rotated bounding box for non-crop, so
the angle reflows it; the fixed cut frame for crop). Not a model fork, not a rendering fork —
one internal branch of one pure function.

Because the cropped result must behave exactly like any other image (R0), there is **one sizing
rule and no special case: the size attribute always sizes the box (the wrapper).** The inner
image's size follows from the transform above and is never set directly by the size attribute.
*(In a renderer without the plugin there is no box, so the authored `width` falls on the image
directly — correct for the untransformed case, gracefully degraded otherwise, F25.)*

**Direction of computation — from the stable intrinsic ratio, applied to the DOM.** The box's
`aspect-ratio` is **computed at render** from the image's **intrinsic ratio** (read once when the
image loads) plus the angle — by the pure functions in `renderer-logic.ts` (`boxAspectRatio`,
`innerImageSize`, `rotatedAabb`) — and **applied to the DOM box, never written to the source** (writing it back would
race the user's edits, §2.1). The crucial part: it is derived from the **stable intrinsic** ratio
(a fixed property of the image), **not** from measuring the rendered, column-dependent box — so
there is **no measure-then-resize retry loop**, which is exactly what designs out the recurring
rotated-box mis-sizing (historically "Bug 2", and the `requestAnimationFrame` / cache hazards
behind it — §4). The inner image then follows in box-relative units (box → image).

**Responsiveness is uniform — crop is not special.** The box is column-capped (`max-width:100%`,
D3) and the inner image is expressed **relative to the box**, so when the column narrows the whole
unit — box *and* inner image — scales together in pure CSS. A crop therefore rescales to the
column exactly like any other image; there is **no crop-specific column-rescaling step and none in
JS**. The box's aspect ratio is computed **by the action** (intrinsic ratio + transform) and
stored, shared by every transformed image, not special to crop.

**One geometry, two media — rendering ≡ export.** The box→image geometry (AB5) is computed once
and consumed by both consumers: the **renderer** applies it as DOM/CSS; the **export** replays the
*same* box size + inner-image transform + native `filter` onto a **box-sized canvas**, whose bounds
clip exactly like `overflow:hidden`. So export is literally *"render the box, as displayed"* (F12) —
there is no second crop/rotate/scale implementation. (This collapses the old duplication where
`render-core.ts` and `export.ts` each carried their own crop math.)

### 2.4 The CSS contract (`styles.css`)

- **Transforms are native** — `style=` carries `transform` / `filter` directly, so no injected
  rule is needed to render them; they show even with no plugin and no theme CSS (T3).
- **`.lie-image-area`** is the always-present wrapper: `overflow: hidden` unconditionally. Its
  shape is an **`aspect-ratio`** — derived at render from the image's intrinsic ratio (+ angle) and
  **applied to the DOM box, not written to the source** (§2.3, AD6); the box has no native
  auto-height. Everything else is native: the img's `transform`/`filter`, and a crop box's
  aspect-ratio is the cut frame. A fixed px `height` only for deliberate distortion. The column cap
  (D3)
  reuses Obsidian's own **`--file-line-width`** (the text-column width, `700px` by default) rather
  than measuring or hard-coding it (AD9).
- **Preset widths** are the CSS variables `--lie-size-small/medium/large`, injected by
  `styles-injector.ts` with the settings-configured values so presets stay re-themeable in one
  place. *(Verified — CDP on the running app + the Obsidian Embed CSS-variable docs: Obsidian
  ships no native image-size / width-preset variables, so these are plugin-defined.)*
- **Alignment** sits as a class on the `img`; the float acts on the **embed** (the plugin's own
  `.lie-wrapper` overlay container in live preview / Obsidian's `.image-embed` in reading view) via
  `:has(img.lie-left)` — never on the `img` (flex child) or the `.lie-image-area` (inside the
  embed). *(Pitfall §4.)*
- **Native-suppression (live preview)** — static, **UNIFORM** rules hide Obsidian's native image in
  **every** embed: `.cm-content .internal-embed.image-embed > img` and `> .image-wrapper` (covering
  both the Markdown `> img` and the wikilink `.image-wrapper`), plus the native `> .edit-block-button`
  (so the native `<>` icon never leaks, Bug 12). The rules **never** hit the plugin's own
  `.lie-wrapper`. The `{…}` block (real document text) is hidden when the image is rendered and shown
  when the line is active — keyed on `.cm-active` / `.cm-line:has(> .cm-formatting)`.
- **Reveal-for-looking** — the "fake" raw link + the `{…}` ride on a **mode class**: `lie-rev-auto`
  (shown on cm-line **hover** or the active line) or `lie-rev-always` (shown everywhere), set from the
  *default raw-link reveal state* setting `alwaysShowLink` (AB19/F20). The `<>` (eye) toggle stamps a
  **`.lie-dismissed` LINE class** that overrides the mode and hides the source for that one image
  (`!important`); it **auto-clears** in auto mode (once the line is neither hovered nor active) and
  **persists** in always mode until toggled again. **No reactive JS** does the reveal — it is static
  classes the CSS keys on, not a measurement loop, not an edit field, and **not** a third "hidden"
  reveal mode (AD5, AB16).
- **Tall-float cap** — a float marked `.lie-tall` by the renderer (a declarative height estimate,
  AD6) stacks as a non-floated block under `body.lie-safe-tall-float` in **both** views
  (`.lie-wrapper:has(img.lie-tall)` in LP, `.image-embed:has(img.lie-tall)` in reading view), so a
  tall LP float can't derender on scroll (the `tallFloatSafe` setting, default on).
- The bulk lives in the shipped static `styles.css`: the box/overflow rules, the alignment `:has()`
  float routing (with `z-index:1` keeping the floated image clickable), inline, the
  native-suppression/reveal rules and the tall-float cap. `styles-injector.ts` (AB20) adds only the
  **preset-width vars** and the **toggleable** alignment/inline classes at runtime. Neither carries
  any **transform/filter** rules (native CSS) or **decoration** classes (shipped as snippets, F16).

---

## 3. Per-layer realization

Mirrors `architecture.md` §4 (building blocks). Only the load-bearing functions are called out.

### 3.1 Model & source

- **`transforms.ts`** — `parseAltText` (block content → `ImageTransform`) and
  `serializeTransform` (the inverse); tokenizes on whitespace, reads `.class` and `key=value`
  tokens. **Target state (T2.3):** the recognized keys are the bare set `align` / `width` /
  `rotate` / `flip` / `transform` / `filter` / `aspect-ratio` (+ `.class`, `style=`, `.lie`); the
  `transform` / `filter` values are kept as **pass-through strings** (routed whole to the `<img>`,
  not decomposed for rendering); the **editor** extracts only the one function it edits (targeted
  regex). This same parse/serialize is the **shared logic for all three consumers** (no-JS
  fallback, runtime, toolbar writer, AB7a). *(The present code parses native-CSS `style=`; the
  bare-key set is the change. The old `filterToVars` / `FILTER_VAR_NAMES` → `--lie-*` composing
  layer is gone — `filter` is the final CSS.)* Round-trip and edge cases unit-tested
  (`tests/transforms.test.ts`).
- **`link-format.ts`** — `convertEmbedLine` rewrites the link form when `desiredFormat`
  (Obsidian's wikilink setting) differs, via Obsidian's `fileManager.generateMarkdownLink`,
  defensively (falls back to leaving the link as-is). It folds a Markdown native `|size` into
  the block and leaves a wikilink's native size in place (F5, F6).
- **`image-resolver.ts`** — `findImageInSource` maps a DOM `img` to its `{ line, ch }` range
  (`findImageInText` is the pure half; `getImageFilename` reads the linkpath). The rewrite itself goes
  through the shared `writeSource` (below), leaving the cursor and scroll untouched (D11). *(The old
  `updateImageSource` writer is gone; `parseLocationTransform` is a dead export — DRY audit.)*
- **`source-writer.ts`** — `writeSource(view, changes)` is the **single funnel** for every plugin
  edit to the document (AD1, edit direction): it dispatches the change as **one** CM transaction,
  isolated in history (`isolateHistory.of("full")`) and tagged `LIE_USER_EVENT`, so each plugin edit
  is **exactly one undo step** (never merged with adjacent typing, never split — regardless of how
  large the `{…}` block is), and moves neither cursor nor scroll (D11; it re-pins scroll if a reflow
  nudged it). `@codemirror/commands` is kept an esbuild external; a minimal ambient decl in
  `env.d.ts` gives tsc the `isolateHistory` type. `main.ts` (`writeTransform → writeToSource`) and the
  LP resize both funnel through it.
- **`snippet-scanner.ts`** — `scanSnippets` reads `.obsidian/snippets/*.css` via the vault
  adapter, pattern-matches image classes, filters out `lie-*` and Obsidian-internal classes,
  and re-runs on the file-watcher (F16, T6). The plugin also **ships example decoration snippets**
  it can install into `.obsidian/snippets/` on request (opt-in) and reset to the shipped version;
  once installed they are discovered like any other snippet (F16.1).

### 3.2 Render core

- **`renderer-logic.ts`** (pure, tested) — `boxAspectRatio` and `innerImageSize` compute the box's
  `aspect-ratio` and the inner-image geometry as **pure functions of the intrinsic ratio + transform**
  (no DOM measurement); `rotatedAabb` gives the rotated bounding box; `estimatedBlockHeight` is the
  synchronous CM6 height estimate; `isTallFloat` / `TALL_FLOAT_THRESHOLD_PX` decide the tall-float cap
  from the stored size (declarative, AD6 — no measure).
- **`render-core.ts`** (Obsidian-FREE) — `buildLayers` builds the uniform structure for every image
  (normal = degenerate transform): the 3-layer outer / inner-frame / `<img>` (§2.3) with
  `overflow:hidden` on the frame; it sizes the **outer** (width attr, else column-capped intrinsic)
  + sets its derived `aspect-ratio`, applies `rotate` + `flip` to the **inner-frame** about its
  centre (`applyOrientation`, the structural pivot that fixes Bug 25) and the crop `transform` +
  `filter` to the **`<img>`** (outer → frame → image sizing direction, §2.3); it shapes the frame
  from the base shape (natural ratio, or the cut shape for a crop) + angle (`shapeFrame`/`cropAspect`);
  it re-derives the `lie-left/right/center` marker class from the `align` field, marks a tall float
  `.lie-tall` (via `isTallFloat`, §2.4 cap) and adds `lie-inline` for an inline icon. `ensureLayers`
  upgrades a reused legacy 2-layer DOM; `unwrapBox` tears the layers down. It also exports `RENDER_CSS`
  (the structural layer rules, injected by the plugin AND the runtime — one source, R0) and the
  identification (`CLAIM_SELECTOR` + `readTransform`). The plugin renderer and the runtime are **two
  callers of this one builder** (DRY); the reading-view adapter (the post-processor wiring) lives in
  `main.ts`.
- **`caption.ts` / `caption-logic.ts`** — `createCaption` renders the alt text via Obsidian's
  `MarkdownRenderer` (AD9) below the box, as a child of the **embed** (never inside the box, §2.3).
  It is sized to the box width by **pure CSS**: `.lie-caption { width: 0; min-width: 100% }` inside
  the `fit-content` embed. *(CDP-verified: this keeps the embed at the box width **and** wraps a
  long caption; `align-self:stretch`, `embed{width:max-content}`, and bare `min-width:100%` all
  fail — `width:0` stops the caption widening the flex `fit-content`, `min-width:100%` then
  re-expands it to the box's content box.)* Because the box's CSS width **is** its visible width
  (axis-aligned, explicit), this holds for rotated/cropped too — dropping the old JS width-sync +
  `ResizeObserver` + polling (the T-L10 hazard). *(Re-confirm against the implemented new
  structure.)* `captionMarkdown` / `captionFromAlt` strip the native `|size` and are tested
  (`tests/caption.test.ts`).

### 3.3 View adapters

- **Reading view** — `registerMarkdownPostProcessor` runs on rendered sections, calls the render
  core, attaches chrome. Its reconcile skips images already owned by the live-preview pass (the
  plugin's own `.lie-wrapper` overlay) so the two passes never compete (AD5, AD6).
- **`live-preview.ts`** — `createLivePreviewExtension` is a CM6 `StateField` that, for each embed,
  draws an `EmbedWidget` carrying the plugin's own transformed image (the uniform `.lie-wrapper`,
  R0/AD3) in one of **three modes** (`WidgetMode`), the **same uniform chrome** in each — only the
  *placement* and the decoration kind differ (AB9, F17):
  - **`standalone`** — a `{…}` embed keeps Obsidian's `.cm-line`, so the widget renders **INLINE in
    that line** (`side: 1`, not `block:true`). The host cm-line stays a **non-BFC**, so a
    `lie-left`/`lie-right` `float` **escapes** into `.cm-content`'s BFC and wraps the following lines
    (F18); the fake link + `{…}` share the line.
  - **`block`** — a **bare** `![](…)` line (no `{…}`) is block-promoted by Obsidian into a
    cm-line-less `.cm-content` child that would swallow an inline widget, so the widget is a
    **`block:true`** decoration landing as its own `.cm-content` child next to the (image-suppressed)
    native embed. `estimatedHeight` is supplied only for this mode (CM models it out of flow).
  - **`inline`** — a tiny mid-text icon (`lie-inline`), found by `inlineEmbeds`, rendered via
    `Decoration.replace`.
  It does **not** replace the standalone line — the text is left intact, so Obsidian's native embed
  still loads the image and provides its own cursor-reveal; the native image is hidden by static
  **uniform** CSS (§2.4). The native-resize-corner drag writes the new width via the shared
  `writeSource` (`source-writer.ts`). Rebuilt on `docChanged` / selection change /
  `editorLivePreviewField` change / a `<>` dismiss toggle / a `refreshDecorations` effect.
- **Widget + CSS native-suppression (AB16).** Both the suppression and the reveal follow from one
  CDP-verified fact: Obsidian builds its native embed from the **document syntax tree** (the raw
  `![[…]]` bytes), independent of our decorations, **and** performs its own cursor-reveal of that
  source as real document text when the caret enters the line. The plugin **embraces** that native
  embed rather than fighting it.
  - **Suppress native = static CSS, not coverage.** The widget draws the plugin's own `.lie-wrapper`
    image; **uniform** CSS hides Obsidian's native `> img` and `> .image-wrapper` in **every** embed
    (never the plugin's own `.lie-wrapper`). The document text is **never** edited or covered — it
    stays the portable `![[…]]{…}` (F1) and the native embed keeps loading the file. (L1 still holds —
    an *un-replaced* line re-fires the native embed and would show `{…}` as literal text — but that is
    now **wanted**: we keep the native embed and CSS-hide it, rather than block-replacing the line.)
  - **Reveal-for-looking (F8)** is a display-only "fake" raw link the plugin paints (it knows the
    link) plus the `{…}`, shown/hidden **purely by CSS** in one of two natural modes from the global
    *default raw-link reveal state* setting (`alwaysShowLink`, AB19/F20): **auto** (`lie-rev-auto` —
    shown on cm-line hover or the active line) or **always** (`lie-rev-always` — shown everywhere). The
    `<>` (eye) toolbar control **dismisses** the source for that one image — a transient
    **`.lie-dismissed`** LINE class (a `toggleReveal` StateEffect tracked in the field), **not
    persisted per image** (F8); it **auto-clears** in auto mode once the line is neither hovered nor
    active, and **persists** in always mode until toggled again. There is **no** third "hidden" reveal
    mode and **no** `cycleRevealMode`. **No reactive JS** drives the reveal, no plugin-owned **edit**
    field — just static classes the CSS keys on.
  - **Edit (F9)** is Obsidian's **own native cursor-reveal** of the source as real document text —
    re-verified in-app (2026-06) for **both** standalone and inline embeds (they don't materially
    differ; a standalone embed shifts down a line when its source appears, so the overlay follows).
    Caret / selection / copy are native, **one** editing root — there is **no** plugin-owned editable
    field (no `<textarea>`, no `contenteditable`, no caret-seam to bridge).
  - **`{…}` (F3)** is real document text Obsidian leaves visible; the plugin **hides it via CSS** when
    the image is rendered (F3 holds) and lets it show when the line is active (editing) — the same
    `.cm-active` signal.
  - **Signal:** `.cm-active` (fallback: native widget DOM presence via `:has()`). The one thing still
    to verify is that `.cm-active` flips in lock-step with Obsidian's native reveal (marked to-verify,
    not asserted as proven).
- **`live-preview-logic.ts`** (pure, tested) — `lineDecorations` (standalone line →
  decoration; returns brace-less `params`), `inlineEmbeds` (mid-text embeds), `rewriteWidth`, and the
  `EMBED_LINE` / `INLINE_EMBED` matchers. (`cycleRevealMode` is **gone**; `RevealMode` now lives in
  `live-preview.ts` as the two-valued `"auto"|"always"` derived from the setting — no per-line mode
  cycle. The `<>` control is the **eye dismiss**: a `.lie-dismissed` LINE decoration that auto-clears
  in auto mode, F8.)

### 3.4 Editing UI

- **`toolbar.ts`** — `ImageToolbar` builds the ordered, divider-grouped bar (`buildToolbarElement`),
  revealed on hover/selection, positioned `absolute` on the box (D1, D2). **D1.1 (too-small →
  above)** is a **CSS container query** on the box, no JS: *(CDP-verified)* `.lie-image-area
  { container-type: size }` + `@container (max-height: <bar height>) { .lie-toolbar { top: auto;
  bottom: 100% } }` flips the bar above at small sizes and is inert when large. (`container-type:
  size` needs a resolvable height — the box's `aspect-ratio`/explicit size provides it; a
  content-driven height would collapse under size containment, so use it only on the sized box.)
- **`anchored-submenu.ts` (+ `-logic`)** — `AnchoredSubmenu` is the single host (AD8);
  `placeSubmenu` computes placement (compact under the toolbar; clamped into the viewport,
  never flipped past the explorer).
- **`crop-editor.ts` (+ `-logic`)** — `CropEditor` overlay; `snapTranslate` / `snapAngle` /
  `snapScale` quantize live during the drag (F12), `toCropResult` emits the result.
- **`filter-panel.ts`** — `FilterPanel`: histogram + grouped sliders + temperature; reads/writes
  the native `filter` value; docked beside the image on the roomier side (D7).
- **`size-submenu.ts`** — `buildSizeBody`: the presets (icon/small/medium/large/original) and the
  side-by-side width/height fields (F24, D6.1), hosted by `AnchoredSubmenu`.
- **`export.ts`** — `renderTransformedImage` replays the **shared geometry** (`renderer-logic`) +
  the native `filter` + the same inner-image transform onto a canvas (canvas bounds clip =
  `overflow:hidden`), producing the **same visual** as displayed but sized from the **original
  image's native resolution** (F13, highest quality — the display `width` does not reduce it; the
  box geometry is scaled up to original pixels) — **no** separate crop/rotate block (removes the
  current `applyCrop` ↔ export duplication). It replays the **layer nesting** on the canvas
  (`save` → inner-frame transforms → img transform → `drawImage` source-rect crop → `restore`),
  sharing the transform **model** with the CSS adapter (two adapters over one model, AB15) — never
  a parallel structure, and stored values are never rewritten (only the output bbox is computed).
  Export fidelity is the **2D-affine + standard-filter** boundary (AB15): 3D/perspective,
  clip-path, border-radius, box-shadow and non-standard filters are not exportable. Decoupled from
  `saveExport`; `suggestExportPath` pre-fills the next free `{name}-{n}` and prefers the native
  dialog (F13).

### 3.5 Plugin shell

- **`main.ts`** registers both adapters, `registerCommands` (`commands.ts`, `checkCallback`
  gated on image context), `LieSettingTab` (`settings.ts`), and `StylesInjector`
  (`styles-injector.ts`). `i18n/` follows the Obsidian locale. `editing-toolbar-integration.ts`
  is version-gated and off by default (F23, T10). `dev-bridge.ts` is tree-shaken from production.

### 3.6 Portable runtime (AB7a — IMPLEMENTED)

The standalone bundle that delivers T3 portability. **Built.**

- **Shared logic.** It imports the **same** model parse/serialize (`transforms.ts`'s
  `parseAltText` / `serializeTransform`) and the geometry (`renderer-logic.ts`) via the
  Obsidian-free core (`render-core.ts`) — one format, three consumers (AB7a). No reimplementation
  of the grammar or the box math.
- **DOM builder.** A single `buildLayers(img, transform)` (in `render-core.ts`) constructs the
  **3-layer** structure (outer / inner-frame / `<img>`) around a claimed `<img>` and routes each
  datum to its layer (the same routing table as §2.3): `align`/`width`/`aspect-ratio`/`style`/`.class`
  → outer; `rotate`+`flip` → inner-frame; `transform`+`filter` → `<img>`. The plugin renderer and
  this runtime are **two callers of the same builder** (DRY); the plugin wraps it in Obsidian's embed,
  the runtime hydrates a bare page.
- **Runtime entry + build target.** A **second esbuild entry** (`src/runtime.ts`) produces a
  framework-free **`lie-runtime.js`** (named for the plugin id — *not* `live-image-runtime.js`), a
  browser **IIFE**. The **render CSS is inlined as the `RENDER_CSS` string in the shared core** and
  injected at startup (CSS-in-JS — the same pattern `src/styles-injector.ts` uses), so the standalone
  is a **single `<script>` include**, no separate stylesheet. That core string is the **one source**
  the plugin injects too (R0: identical render); `styles.css` keeps only the Obsidian embed
  integration + editing-**chrome** rules. The entry runs on `DOMContentLoaded` (+ a `MutationObserver`
  for late content), selects claimed images and calls `buildLayers`. The runtime esbuild entry has
  **no `obsidian` external**, so a stray framework import fails the build (the import-discipline guard
  keeping the bundle Obsidian-free). `runtime-smoke.html` is the manual/CI browser fixture.
- **Tolerant selector / identification (§ identification rule).** The runtime claims an `<img>`
  **iff** it carries a distinctive transform key or `.lie` — selector
  `[rotate],[flip],[transform],[aspect-ratio],.lie` (and the **data-prefixed** Pandoc variants
  `[data-rotate],[data-flip],[data-transform],[data-aspect-ratio]`, since Pandoc force-prepends
  `data-`). `align`/`width`/`style`/`class` alone are **not** claimed (native CSS handles them).
  No prefix on the bare keys → a small accepted collision risk (T2.3).
- **Per-layer CSS application.** The runtime applies the routed values as inline styles/attributes
  on the built layers; the injected render-CSS string carries only the structural rules
  (overflow:hidden on the frame, the float `:has()` routing, the column cap) — `align`/`width`
  already work natively, so the no-JS fallback needs none of it.

---

## 4. Realization pitfalls (regression guards)

The concrete "do not" list each architecture decision translates to — and the failure each one
caused. These are the low-level half of the decisions in `architecture.md` §2.

- **AD3 (uniform element).** No `display:contents` "normal" case, no `width: max-content` on the
  wrapper, no padding on the wrapper box — each reintroduces a divergent path → rotated/normal
  size drift, overflow, or a resize frame offset. Float via `:has()` on the embed, never the
  `img` or `.lie-image-area` → otherwise text never wraps.
- **AD5 (one path per mode).** The live-preview widget draws the plugin's own image and does **not**
  replace the line — block-replacing it was the old model; instead the native embed is kept (it loads
  the image and reveals the source) and CSS-suppressed **uniformly**. A `{…}` embed renders as an
  **inline** widget in its own **non-BFC** cm-line so a `lie-left`/`lie-right` `float` escapes and
  wraps (F18) — **not** a block widget below it; a **bare** embed renders as a `block:true` widget
  (block-promotion leaves no cm-line for an inline one). Because the bare case still needs a *block*
  decoration, it must be a `StateField`, not a `ViewPlugin` (the latter cannot emit block
  decorations). The `{…}` and the reveal are hidden/shown by **static CSS** keyed on `.cm-active` /
  hover, never by un-covering a range (which re-fires the native embed, L1) and never by a
  plugin-owned editable field. Inline mid-text embeds reuse the **same** widget, never a second
  widget. The reading-view reconcile must skip the plugin's own `.lie-wrapper`, or two passes
  re-measure at different widths.
- **AD6 (sizing direction).** Size **one way: box → image.** Never size the box by measuring the
  loaded image — that imperative measure-then-resize loop is exactly what caused the recurring
  rotated-box drift and forced the old `requestAnimationFrame` / `setTimeout` / `naturalWidth`
  workarounds. The box takes the size attribute (else the column-capped intrinsic size); the inner
  image is a pure function of box + transform; the aspect ratio comes from the browser's layout,
  not a JS measure-retry.
- **Model↔adapter contract.** Strip the `{` `}` braces before `parseAltText` — otherwise the
  leading `.class` token reads as `{.class`, is dropped, and only `style="…"` survives (so
  rotate/filter/size still work while classes silently vanish).
- **Link conversion.** Never route the size through `generateMarkdownLink`'s `alias` argument —
  it pushes the size into the alt text.
- **AD7 (testability).** Keep decision logic in the `*-logic.ts` units; logic embedded in
  framework-coupled modules can only be caught by a manual live check.

---

## 5. Notes / residual

- The uniform box computes to `display:block` on a plain page vs `inline-block` where an
  alignment class is present — harmless given the explicit px width, but a residual special case
  to tidy under AD3.
- `*-logic.ts` units are unit-tested in `tests/` (vitest); CM6/Obsidian integration and the
  native save dialog are verified in the running app (the test plan covers the split).
