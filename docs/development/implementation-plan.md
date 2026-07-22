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
| `src/transforms.ts` | AB1 Transform model | `ImageTransform` *(classes/inline; orientation: rotate/flipH/flipV → inner-frame; content: transform/filter → img; footprint: width/height/aspectRatio/box → outer)*<br>`FilterData`<br>`parseAltText` *(bare keys + legacy `style=` back-compat)*<br>`serializeTransform` *(bare keys)*<br>`getRotation`/`setRotation` *(the orientation field)*<br>`toggleFlipH`/`toggleFlipV`/`getFlipH`/`getFlipV` *(fields)*<br>`isCrop`<br>`getFilter`/`setFilter`/`filterToCss`/`parseFilterCss`/`nonDefaultFilter` *(the shared "≠ default" predicate)*<br>`getWidthPx`/`getHeightPx`/`setWidthPx`/`setHeightPx`<br>`PRESET_KEYS`/`PresetKey`<br>`MARKER_CLASS` *(backward-compat parse-skip only — never written)*<br>`INLINE_CLASS` |
| `src/link-format.ts` | AB2 Link form & native-size normalization | `parseEmbedLine`<br>`buildEmbed`<br>`convertEmbedLine`<br>`desiredFormat` |
| `src/image-resolver.ts` | AB3 Source↔DOM mapping (pure — `import type` Editor) | `findImageInSource`<br>`findImageInText` *(occurrence-aware — F2)*<br>`findImageInLine` *(one line, the posAtDOM-disambiguated resolver)*<br>`getImageFilename`<br>`ImageLocation` |
| `src/replace-logic.ts` | AB2/AB3 — "Change image source" (F26, pure) | `buildReplacementEmbed`<br>`replaceEmbedTarget`<br>`planReplaceAll` — build the replacement embed through link-format's ONE writer (`buildEmbed`) rather than a hand-rolled string: table-pipe escaping (`ImageLocation.inTable`) and the write ⊆ read invariant now cover Replace too. A native size already on the embed folds into the `{…}` block like any other active edit (Bug-94 precedent, F6/T2 — never re-emitted as a raw pipe suffix). A caption the desired form cannot represent (a wiki alias containing `]]`) makes the embed keep its EXISTING form — only the path swaps, never lose the link |
| `src/source-writer.ts` | AB3 / AD1 edit writer (shared) | `writeSource` *(one isolated CM transaction per edit)*<br>`LIE_USER_EVENT` |
| `src/snippet-scanner.ts` | AB4 Snippet class discovery | `scanSnippets` *(flat, enabled-only — toolbar)*<br>`scanSnippetFiles` *(per-file grouped + our-file status — settings)*<br>`SnippetClass`/`SnippetFile`<br>`installBundledSnippet`<br>`resetBundledSnippet`<br>`restoreBundledClass`<br>`isBundledSnippetInstalled` |
| `src/snippet-classify.ts` | AB4 (pure logic) | `parseImgRules`<br>`classifyBundledFile` *(unchanged/changed/deleted vs shipped)*<br>`restoreClassInCss`<br>`findCollisions`<br>`ClassEntry`/`ClassStatus` |
| `src/renderer-logic.ts` | AB5 Geometry (pure) | `boxAspectRatio`<br>`innerImageSize`<br>`rotatedAabb`<br>`estimatedBlockHeight`<br>`isTallFloat`<br>`TALL_FLOAT_THRESHOLD_PX` |
| `src/render-core.ts` | AB6 Uniform 3-layer box + AB7a core (Obsidian-FREE) | `buildLayers` *(the 3-layer builder, shared by plugin + runtime)*<br>`applyFilterPreview`<br>`unwrapBox`<br>`BOX_CLASS` *(outer)*<br>`FRAME_CLASS` *(inner-frame)*<br>`RENDER_CSS` *(structural layer CSS, the single injected source)*<br>`CLAIM_SELECTOR`/`readTransform` *(identification + attrs→model)* |
| `src/caption-logic.ts` | AB7 Caption (text, pure) | `captionMarkdown`<br>`captionFromAlt` |
| `src/caption.ts` | AB7 Caption (DOM) | `createCaption`<br>`CaptionHandle` |
| `src/live-preview-logic.ts` | AB9 LP line→decoration (pure) | `lineDecorations`<br>`inlineEmbeds`<br>`rewriteWidth`<br>`EMBED_LINE` / `INLINE_EMBED` *(span text-parsers, not the detection gate — AD10)*<br>`reduceReveal` *(pure reveal-state reducer: mode + engaged + dismiss + cursor-vs-spans → show? + auto-clear?)* |
| `src/live-preview.ts` | AB9 Live-preview adapter (+ AB16 widget + CSS native-suppression) | `createLivePreviewExtension`<br>`refreshDecorations`<br>`toggleEmbedReveal` *(the `<>` dismiss action, shared by both toolbar presentations — resolves the editor via `EditorView.findFromDOM`, keys the toggle on `e.attrEnd`)*<br>*(internal: `WidgetMode = block\|inline\|standalone`, `RevealMode = native\|auto\|always`)* |
| `src/toolbar.ts` | AB10 Toolbar | `ImageToolbar` *(floating presentation, on `body`)*<br>`buildToolbarElement` *(the ONE renderer — turns the shared `ToolbarItem[]` into the bar for **both** presentations; the EmbedWidget hosts it in-chrome, `ImageToolbar` floats it, only host + class differ)*<br>`ToolbarButton` *(now `className?` for the `<>` reveal's `lie-toolbar-reveal` + per-show `is-off`)* |
| `src/anchored-submenu-logic.ts` | AB11 Sub-menu placement (pure) | `placeSubmenu`<br>`SubmenuPlacement` |
| `src/anchored-submenu.ts` | AB11 Shared sub-menu host | `AnchoredSubmenu` |
| `src/region-hover.ts` | AB11a Active-region hover binder (D6.2/D6.4) | `bindRegionHover` *(N members → one grace-bridged, nesting-robust hover signal)*<br>`couplePaletteToRegion` *(body-level palette ↔ region, not greyed)* |
| `src/toolbar-region-logic.ts` | AB11a Region decisions (pure) | `clickDismissesToolbar` *(click-away closes filter/size; crop exempt — Bug 62)*<br>`isEngaged` *(the one engagement predicate — AD12: cursor-on-line ∪ hover ∪ selected/active ∪ panel-open)* |
| `src/crop-editor-logic.ts` | AB12 Crop quantization (pure) | `snapTranslate`<br>`snapAngle`<br>`snapScale`<br>`applyRotateGesture` *(macOS trackpad rotate-gesture delta → snapped content angle)*<br>`parsePlacement` *(round-trip inverse)*<br>`toCropResult` *(placement transform + cut width + aspect-ratio ≠ original)* |
| `src/crop-editor.ts` | AB12 Crop editor | `CropEditor` |
| `src/filter-panel.ts` | AB13 Filter panel | `FilterPanel` |
| `src/size-submenu-logic.ts` | AB14 Size presets (pure) | `sizePresets` *(`icon` = a line-height `height`, small/med/large = widths, original = clear — SIZE only, **orthogonal to layout**; F24)*<br>`SizeState`/`SizePreset` *(width/height)* |
| `src/size-submenu.ts` | AB14 Size sub-menu | `buildSizeBody`<br>`SizeState` *(re-export)* |
| `src/ui.ts` | shared DOM helpers | `textButton` *(labelled button — filter/size/crop presets)* |
| `src/export.ts` | AB15 Export | `renderTransformedImage`<br>`suggestExportPath`<br>`saveExport` |
| `src/commands.ts` | AB18 Commands | `registerCommands` |
| `src/settings.ts` | AB19 Settings | `LieSettingTab` *(General · size presets · CSS classes · editing-toolbar · **Syntax & info** — read-only `{…}`-attribute help card (intro + code sample in an "example" callout + one native setting row per keyword) + an `openPluginStore("live-image-editor")` self-store-link button; F20/Change 43)*<br>`LieSettings` *(defaultRevealState `native\|auto\|always` — replaces the boolean `alwaysShowLink`, F8; renderImagesInCodeBlocks — F20, LP-only, default off; presetWidths, tallFloatSafe)*<br>`DEFAULT_SETTINGS` |
| `src/styles-injector.ts` | AB20 Style injection | `StylesInjector`<br>`PresetWidths`<br>`DEFAULT_PRESET_WIDTHS` |
| `src/editing-toolbar-integration.ts` | AB22 Editing-toolbar integration | `getEditingToolbarStatus`<br>`addEditingToolbarButtons`<br>`removeEditingToolbarButtons` |
| `src/i18n/` | AB21 Localization | `index.ts`<br>`en.ts`<br>`de.ts` |
| `src/dev-bridge.ts` | AB23 Dev bridge | CDP relay (dev builds only) |
| `src/runtime.ts` | AB7a Portable runtime | second esbuild entry → `lie-runtime.js` (framework-free IIFE; `RENDER_CSS` inlined → single `<script>` include, CSS-in-JS); on `DOMContentLoaded` + `MutationObserver` it hydrates claimed imgs via the shared `buildLayers`/`readTransform`; tolerant selector `[rotate],[flip],[transform],[aspect-ratio],[filter],.lie` (+ `data-*` Pandoc variants — a bare `filter=` is runtime-only so it must be claimed); no `obsidian` external (import-discipline guard) |

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
- **filter** (`FilterData`: brightness, contrast, saturate, hue, blur, grayscale, sepia), serialized
  as the bare `filter=` CSS string. Plus the class list + `inline`.

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

#### 2.2b Cross-renderer fallback — verified (2026-06-04)

How the bare-key block degrades in the three attribute-list families, deep-researched +
adversarially re-verified (memory `img-attr-fallback-prior-art`; sources: python-markdown
`attr_list`, Pandoc MANUAL, kramdown `syntax.html`, Material-for-MkDocs, W3C CSS Transforms Lesson 1).
Grounds the §2.2 **faithful / inert / runtime-only** claims with primary-source facts:

- **Brace syntax — the one hard incompatibility.** python-markdown (`attr_list`) and Pandoc
  (`link_attributes`) both bind the **bare** `{…}` directly after the image; **kramdown** requires the
  **colon** form `{:…}` (verified 3-0; maintainer declined bare-brace, `gettalong/kramdown#176`). So in
  kramdown / Jekyll / GitHub-Pages the bare block does **not** bind and renders as **literal text**
  after the image — the worst fallback (already flagged in requirements T3). No single brace string is
  valid in both families.
- **No allow-list, no wrapper anywhere** (verified). All three route `.class` / `#id` / `key=value`
  onto the `<img>` **itself** — none wraps it. This is *why* the runtime-only keys need the injected
  runtime: a foreign renderer never builds the outer/inner-frame two-element structure the
  footprint-swap needs, and there is **no pure-CSS single-element path** for a quarter-turn that
  reserves its rotated footprint (`transform` is post-layout — confirmed it does not reflow; the one
  property that did, `image-orientation:<angle>`, was removed from CSS). So on a no-runtime page
  rotate/flip/crop can only degrade to the original image, never render faithfully.
- **Per-attr-type, with no plugin and no runtime:**
  - `style="filter:…"` / `style="width:…%"` (the power-user escapes) → passed through verbatim onto
    the `<img>` in all three → **faithful** (filter + size are layout-neutral, browser-applied).
  - `width=N` → Pandoc emits a real HTML `width=` attribute (its px special-path); python-markdown a
    verbatim `width` attr; both browser-honoured → **faithful**. Using `style="width:…%"` for the
    responsive case deliberately **avoids** Pandoc's width/height path (it only special-cases px units).
  - an unknown decoration `.class` → appended to `class`, **inert** without CSS.
  - the runtime-only keys — `rotate` / `flip` / `transform` **and the DEFAULT bare `filter=`** →
    **python-markdown** emits them verbatim (`rotate="90"` — non-standard but browser-**inert**);
    **Pandoc** prepends `data-` → `data-rotate="90"` (valid HTML5, inert). The orientation/crop keys
    are NOT carried in `style=` on purpose — a `transform:rotate` there would not reflow but **would**
    overflow/overlap neighbours (Murx); a bare `filter=` is inert only because an HTML attribute named
    `filter` does nothing — its faithful path is the `style="filter:…"` escape above (layout-neutral,
    no Murx). The runtime claims `[rotate],[flip],[transform],[filter]` + the `data-*` (Pandoc)
    spellings (§1, `runtime.ts`); with no runtime they all degrade to the original image.

*(Whether the WRITER should also emit the `data-` prefix — valid HTML5 in python-markdown output too,
at the cost of a longer hand-edited block — is an open decision: issues.md → Open decisions.)*

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
- **Preset widths** live in settings (small/medium/large) and are **baked to a literal `width=N` px**
  at click time (`applyPreset` → `setWidthPx`) — faithful in any renderer (the bare `width` HTML
  attribute), not a re-themeable CSS variable, and so **not** setting-reactive (an existing preset
  image keeps its baked px when the setting changes — the deliberate trade-off). *(The earlier
  re-themeable `--lie-size-*` var write-model + `getPreset`/`setPresetWidth` were retired with the
  bare-key migration; the parser still reads a legacy `width: var(--lie-size-…)` as a non-px width.)*
- **Alignment** sits as a class on the `img`; the float acts on the **embed** (the plugin's own
  `.lie-wrapper` overlay container in live preview / Obsidian's `.image-embed` in reading view) via
  `:has(img.lie-left)` — never on the `img` (flex child) or the `.lie-image-area` (inside the
  embed). *(Pitfall §4.)*
- **Native-suppression (live preview)** — static, **unconditional** rules hide Obsidian's native image
  in every embed: `.cm-content .internal-embed.image-embed > img` and `> .image-wrapper` (covering both
  the Markdown `> img` and the wikilink `.image-wrapper`), plus the native `> .edit-block-button` (so
  the native `<>` icon never leaks). The rules stay unconditional (AD5) — the invariant that
  suppression never fires without a replacement is upheld on the ATTACH side, not by narrowing the
  selector: wherever a host sits where this suppression applies, attach always builds the plugin's
  replacement box, even for a normal, transform-less image, which moves the native `<img>` out of the
  direct-child position the selector targets — a host the plugin has not (yet, or ever) attached to
  simply never reaches that position, so its native rendering stays exactly as Obsidian drew it. The
  rules **never** hit the plugin's own `.lie-wrapper`. The `{…}` block (real document text) is hidden when
  the image is rendered and shown —
  **as one whole with the body** (D17) — when the link reveals, keyed on the **parse-derived reveal
  class** the StateField sets in-transaction (AB16b), **not** the retired `.cm-line:has(> .cm-formatting)`
  DOM guess.
- **Reveal-for-looking (three modes, one whole)** — the stand-in "fake" raw link + the `{…}` are shown
  or hidden **together** (D17) by a reveal class derived from the *default raw-link reveal state* setting
  `defaultRevealState` (AB19/F20): **native** (active/cursor line only — the default), **auto** (+ the
  line on **hover**), **always** (everywhere). The stand-in is shown **iff Obsidian's native raw link is
  NOT revealed** — the plugin mirrors Obsidian's *condition* (cursor within the parse-given body span),
  so the two body faces are **mutually exclusive by construction** (D16), never both painted. **For a
  BARE/raw-link block embed the stand-in RESERVES its source line (height), it does not collapse it:**
  the bare source has its OWN line ABOVE the image, so an invisible placeholder line (`visibility:hidden`,
  `reserveStandIn = !cursorInBody`) keeps the image from reflowing when the reveal toggles — *visible*
  when revealed, the invisible placeholder when hidden — and **collapses only when `cursorInBody`** (the
  native shows the identical source line on the cm-line above; reserving too would stack a SECOND line).
  A three-state CSS triad expresses it: `collapse` (no class) · `reserve-invisible` (`.lie-reserve`) ·
  `reserve-visible` (`.lie-reserve.lie-show`). *(Standalone/inline embeds DON'T reserve: there the source
  is INLINE before the image on the same cm-line, so reserving its width would push the image sideways —
  the no-jump fix for standalone is a separate layout rework, putting the source on its own line.)* The `<>`
  toggle dismisses **one embed** — keyed by its doc position `e.attrEnd`, **not the line**, so two embeds
  on a line dismiss independently. It is **link-only**: a per-embed `lie-suppress-native` **MARK** over the
  body span (`e.from…e.embedEnd`) hides only THIS embed's native raw link — even where Obsidian would
  reveal it (Bug 65) — while the stand-in + `{…}` hide via their own withheld `lie-show`; a sibling embed
  or surrounding text on the line is **untouched** (no LINE class, no `!important`). It **auto-clears on
  full disengagement** (AD12) in native & auto, **persists** in always. The decision
  is the pure `reduceReveal`; its application is CSS in the **same transaction** as the selection change
  (no JS style-write frame → atomic, D16) — **no reactive JS loop**, no edit field, no third "hidden"
  mode. **The no-flicker atomicity is CDP-verified before commit** (§3.3, §2.5 / Lesson 16).
- **Tall-float cap** — a float marked `.lie-tall` by the renderer (a declarative height estimate,
  AD6) stacks as a non-floated block under `body.lie-safe-tall-float` in **both** views
  (`.lie-wrapper:has(img.lie-tall)` in LP, `.image-embed:has(img.lie-tall)` in reading view), so a
  tall LP float can't derender on scroll (the `tallFloatSafe` setting, default off).
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
  (`tests/unit/transforms.test.ts`).
- **`link-format.ts`** — `convertEmbedLine` rewrites the link form when `desiredFormat`
  (Obsidian's wikilink setting) differs, via Obsidian's `fileManager.generateMarkdownLink`,
  defensively (falls back to leaving the link as-is). It folds a Markdown native `|size` into
  the block and leaves a wikilink's native size in place (F5, F6). The auto-normalizer's md
  native-size fold (`main.ts` `normalizeNativeSizes`) rides this SAME `parseEmbedLine` →
  `buildEmbed` round-trip — no second regex or escape knowledge outside this one grammar
  source. On a fold, a `width=`/`height=` key already in the block is REPLACED for each axis
  the native size sets (the native pipe size wins) — never appended as a duplicate key.
  **Embed grammar (read ∩ write):** the READ grammar accepts everything Obsidian's own parser
  reads within Markdown syntax; the WRITE side emits only Obsidian's canonical form. One
  SCANNER at this source replaces every embed regex (the resolver's and live-preview-logic's
  included) — parenthesis balance and escapes are beyond regular expressions. Read rules,
  verified against Obsidian's live parser: a WIKI inner runs to the FIRST `]]` (lazy; single
  `[`/`]` legal), the table escape layer strips first (`\|` ≙ `|` — in a wikilink `\|` IS the
  alias separator, never part of a filename; `splitWikiInner` is the one shared split), the
  alias splits at the first pipe, and a `#`/`^` subpath belongs to resolution, not the
  filename. An MD alt resolves CommonMark backslash-escapes (`\]` …) plus the table layer; an
  MD destination comes in three forms — bare with arbitrary-depth balanced or `\(\)`-escaped
  parentheses (unbalanced → not an embed, exactly like Obsidian), the `<…>` angle form, and an
  optional trailing `"…"` title that is recognized and DISCARDED (Obsidian keeps it nowhere);
  `%`-decoding applies to comparisons, never to the stored path. WRITE: `buildEmbed` emits the
  canonical Obsidian form — an md destination percent-encodes exactly Obsidian's own set
  (space, backslash, control characters; parentheses and umlauts stay raw), the angle form is
  never newly produced, a wiki inner stays raw, and into a table row every pipe goes out
  escaped (`escapePipe`). Deliberate, documented limit: escapes outside these slots stay out
  of the grammar. The writer never emits a link the read grammar (or Obsidian) cannot read back
  losslessly — an embed whose caption cannot be represented in the target form (a wiki alias
  containing `]]`) keeps its current form instead of being converted (never lose the link).
- **`image-resolver.ts`** — maps a DOM `img` to its source `ImageLocation`. `findImageInLine`
  resolves the embed on ONE known line (the CM6 `posAtDOM` path — line-accurate even for a duplicated
  file); `findImageInText(text, src, occurrence)` resolves the **occurrence-th** embed of a basename
  for the reading-view render path (F2 — both halves position-exact, never first-basename-match);
  `findImageInSource` is the editor-scan fallback. The module is **pure** (`import type` Editor — so
  the resolvers are vitest-tested, `tests/unit/image-resolver.test.ts`); the rewrite goes through the
  shared `writeSource` (below), scroll untouched, cursor on the image line (D11). The wiki
  path/alias split rides link-format's `splitWikiInner` (the table-escaped `\|` handled in ONE
  place), and `ImageLocation` carries `inTable` (from its line) so the writers escape pipes
  when rebuilding an embed inside a table row.
- **`source-writer.ts`** — `writeSource(view, changes, cursor?)` is the **single funnel** for every
  plugin edit to the document (AD1, edit direction): it dispatches the change as **one** CM transaction,
  isolated in history (`isolateHistory.of("full")`) and tagged `LIE_USER_EVENT`, so each plugin edit
  is **exactly one undo step** (never merged with adjacent typing, never split — regardless of how
  large the `{…}` block is), and re-pins scroll if a reflow nudged it (D11). When `cursor` is given
  (the single-image edit path), a **prior** selection-only transaction (`addToHistory: false`) moves
  the caret to the image's line — that becomes the change's `startSelection`, which CM6 restores on
  undo, so cmd+Z no longer scrolls to the document top; bulk writers omit it. `@codemirror/commands`
  is kept an esbuild external; a minimal ambient decl in
  `env.d.ts` gives tsc the `isolateHistory` type. `main.ts` (`writeTransform → writeToSource`) and the
  LP resize both funnel through it.
- **`snippet-scanner.ts`** — `scanSnippets` reads `.obsidian/snippets/*.css` via the vault
  adapter, pattern-matches image classes, filters out `lie-*` and Obsidian-internal classes,
  and re-runs on the file-watcher (F16, T6). The plugin also **ships example decoration snippets**
  it can install into `.obsidian/snippets/` on request (opt-in) and reset to the shipped version;
  once installed they are discovered like any other snippet (F16.1). For the settings overview,
  `scanSnippetFiles` returns the same enabled-only classes **grouped by file**, folding in the
  bundled file's diff status; `restoreBundledClass` rewrites one class back to shipped (F16.3). The
  diff/collision arithmetic lives in the pure **`snippet-classify.ts`** (`parseImgRules`,
  `classifyBundledFile`, `restoreClassInCss`, `findCollisions`) — no vault/Obsidian imports, so it's
  unit-tested in `tests/unit/snippet-classify.test.ts`.

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
  centre (`applyOrientation`, the structural pivot that fixes Bug 50) and the crop `transform` +
  `filter` to the **`<img>`** (outer → frame → image sizing direction, §2.3); it shapes the frame
  from the base shape (natural ratio, or the cut shape for a crop) + angle (`shapeFrame`/`cropAspect`);
  it re-derives the `lie-left/right/center` marker class from the `align` field, marks a tall float
  `.lie-tall` (via `isTallFloat`, §2.4 cap) and adds `lie-inline` for an inline icon. `ensureLayers`
  upgrades a reused legacy 2-layer DOM; `unwrapBox` tears the layers down. It also exports `RENDER_CSS`
  (the structural layer rules, injected by the plugin AND the runtime — one source, R0) and the
  identification (`CLAIM_SELECTOR` + `readTransform`). The plugin renderer and the runtime are **two
  callers of this one builder** (R0); the reading-view adapter (the post-processor wiring) lives in
  `main.ts`. **Pitfall — Obsidian-only globals in the runtime closure:** the shared core (and
  `caption-dom.ts`) reference Obsidian's window-aware globals `activeDocument` / `activeWindow`, which
  do NOT exist off-Obsidian — so the first hydrate threw a ReferenceError until fixed (Bug 119, a
  Change 40 sweep regression). Rather than thread a Document through the shared core, the runtime ENTRY
  (`runtime.ts`) SHIMS these globals (AD9 runtime exception — the runtime supplies the missing platform
  binding itself, as it supplies its own inline-Markdown renderer): `Object.assign(globalThis, {
  activeDocument: document, activeWindow: window })` at the top of `run()`, before the first hydrate.
  So the shared core stays identical for both callers and Feature 39's future `window` → `activeWindow`
  sweep is safe in the runtime too. Guarded by `tests/unit/runtime-global-shim.test.ts`.
- **`caption.ts` / `caption-logic.ts`** — `createCaption` renders the alt text via Obsidian's
  `MarkdownRenderer` (AD9) below the box, as a child of the **embed** (never inside the box, §2.3).
  It is sized to the box width by **pure CSS**: `.lie-caption { width: 0; min-width: 100% }` inside
  the `fit-content` embed. *(CDP-verified: this keeps the embed at the box width **and** wraps a
  long caption; `align-self:stretch`, `embed{width:max-content}`, and bare `min-width:100%` all
  fail — `width:0` stops the caption widening the flex `fit-content`, `min-width:100%` then
  re-expands it to the box's content box.)* Because the box's CSS width **is** its visible width
  (axis-aligned, explicit), this holds for rotated/cropped too — dropping the old JS width-sync +
  `ResizeObserver` + polling (the Lesson 10 hazard). *(Re-confirm against the implemented new
  structure.)* `captionMarkdown` / `captionFromAlt` strip the native `|size` and are tested
  (`tests/unit/caption.test.ts`).

### 3.3 View adapters

- **Reading view** — `registerMarkdownPostProcessor` runs on rendered sections, calls the render
  core, attaches chrome. Its reconcile skips images already owned by the live-preview pass (the
  plugin's own `.lie-wrapper` overlay) so the two passes never compete (AD5, AD6). The SAME
  post-processor path also renders post-processor-hosted embeds nested INSIDE live preview (a table
  cell, a callout, a footnote popover) — there is no separate table/callout code path: for every
  rendered host copy the adapter makes ONE attach decision, and suppression, the replacement render,
  the caption and the hover region all follow from it, never handled piecemeal per host kind. The box
  is built (even for a normal, transform-less image) whenever the host sits where the live-preview
  native-suppression CSS could otherwise hide it with nothing to show in its place — a suppressed host
  always gets its replacement, never the reverse. A host copy Obsidian itself has superseded and hidden
  (e.g. a table cell's static render once its row's own live cell editor takes over) is left alone, not
  attached a second time — attach stays idempotent per copy, and a hidden copy's stale chrome is never
  what the user sees. The caption text is derived the same way the live-preview widget already does:
  from the SOURCE text via the position-exact resolver, not from the rendered `alt` attribute (which
  Obsidian defaults to the bare filename for an un-aliased embed) — one caption source for both
  adapters. The hover region binds to the host copy the plugin actually decorated, the same
  region-hover pattern the floating toolbar already uses, so hover opens the toolbar there exactly as
  it does everywhere else.
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
    native embed. `estimatedHeight` is supplied only for this mode (CM models it out of flow). The
    bare stand-in raw link is **hosted inside this widget** (no cm-line to carry an inline stand-in).
    A reveal flip changes only `showStandIn`/`reserveStandIn`, so `EmbedWidget` keeps them in `eq()` but
    implements **`updateDOM`**: it mutates only the hosted stand-in's reserve-triad class **in place**
    (keyed off a `data-lie-struct` structural signature on the wrapper) and keeps the DOM — the image
    **and its async caption are never destroyed/rebuilt**, so a hover/cursor reveal no longer flickers
    the caption (the resize-affordance **1c** regression). A *structural* change (embed/params/caption/
    dismiss) fails the struct check, so CM recreates as normal.
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
    stays the portable `![[…]]{…}` (F1) and the native embed keeps loading the file. (Lesson 1 still holds —
    an *un-replaced* line re-fires the native embed and would show `{…}` as literal text — but that is
    now **wanted**: we keep the native embed and CSS-hide it, rather than block-replacing the line.)
  - **Reveal-for-looking (F8) — the whole link, two drivers (AB16b).** The link is **one unit**: the
    **body** (the native raw link Obsidian reveals, *or* the plugin's display-only **stand-in** fake link,
    AB16a) plus any trailing **`{…}`** — they **always show/hide together** (D17). The drivers, never
    doubled (D16): **Obsidian** drives the **native raw link** (revealed while the cursor sits **within
    the body span**, hidden otherwise — the plugin cannot force this, hence the stand-in); the **plugin**
    drives the **stand-in** (shown *for looking* per the reveal state **iff the native raw link is NOT
    revealed**). The plugin computes "native revealed" by **mirroring Obsidian's own condition** — the
    cursor within the **parse-given body span** (AD10) — **not** by observing the DOM (the retired
    `:has(> .cm-formatting)` guess), so the two body faces are mutually exclusive **by construction**
    (D16). The **reveal state** is the global *default raw-link reveal state* setting (`defaultRevealState`,
    AB19/F20) in **three modes**: **native** (active/cursor line only — default), **auto** (+ the line on
    **hover**), **always** (everywhere). The `<>` toolbar control is a transient per-**embed** **dismiss**
    (keyed by `e.attrEnd` via a `toggleReveal` StateEffect, **not persisted**, F8) that suppresses the link
    **link-only** — the stand-in + `{…}` withhold their `lie-show`, and a per-embed `lie-suppress-native`
    MARK over the body span hides the native raw link (Bug 65) — for THAT embed alone, auto-clearing on
    full disengagement (AD12) in native & auto, persisting in always. There is **no** third "hidden" mode,
    no `cycleRevealMode`.
  - **The seamless body↔`{…}` swap (the LEIT-case).** The `{…}` is **native editable text**. When the
    cursor moves from the body **into** the `{…}`, Obsidian hides the native raw link (cursor past the
    body) — so the **stand-in carries the body** while the `{…}` is edited natively, and the **whole link
    stays visible** throughout (cursor anywhere on the link ⇒ shown). The native↔stand-in swap at the
    body/`{…}` boundary must be **seamless** (the fake never visibly differs from the real source) and
    flicker-free.
  - **Mechanism — deterministic, parse-derived, one transaction (§2.5).** The decision is the pure
    `reduceReveal` over the mode, the **engaged** predicate (AD12), the dismiss, and the cursor's position
    **relative to the parse-given body / `{…}` spans**. It is **applied as decoration classes set in the
    SAME transaction** as the selection change, so CSS does the show/hide — one class drives body+`{…}` as
    a whole (D17) and the native-vs-stand-in mutual exclusion is a CSS consequence of one condition (D16),
    with **no JS style-write frame**. **Open gate (§2.5, Lesson 16): that this same-transaction flip lands
    in the same paint frame as Obsidian's native reveal — no flicker — is CDP-verified BEFORE commit**
    (focus-emulation for the cursor reveal, a real `Input` pointer for hover). If a frame slips, fall back
    to coupling the stand-in/`{…}` to Obsidian's native reveal in **pure CSS** (timing-safe), keyed on the
    **parse-derived line class**, never the retired `:has(> .cm-formatting)`.
  - **Edit (F9)** is Obsidian's **own native cursor-reveal** of the source as real document text —
    re-verified for **standalone** and **inline** embeds (caret / selection / copy native, **one** editing
    root, no `<textarea>`/`contenteditable`/caret-seam). **Bare / block-promoted embeds (Bug 114) — to
    verify in-app:** Obsidian gives that line **no `.cm-line` and no native reveal** (§4 CDP), so the
    **stand-in restores reveal-for-looking** there (every embed gets the reveal machinery, AB16b); whether
    the source is **natively editable** on a block-promoted line, or needs a plugin fallback, is a **CDP
    question to settle during implementation — do not assume.** Decided alongside (the §2.7 / F20 source
    point): a **code-block** embed's `![](…)` stays **literal code text**, so it gets **no stand-in and no
    reveal** — there is nothing to hide.
  - **`{…}` (F3)** is real document text Obsidian leaves visible; hidden via the same reveal class when
    the image is rendered (F3 holds), shown as **one whole with the body** when the link reveals.
  - **Engagement is one predicate (AD12).** "Active / engaged with the image" is the single `isEngaged`
    union — cursor-on-line ∪ hover ∪ selected/active (editor focused) ∪ any open plugin surface (crop /
    filter / class / sub-menu) — read by the reveal **pin** (the state does not flip while engaged,
    **Bug 86**), the dismiss **auto-clear** (fires only on full **dis**engagement) and the toolbar
    greyed/active state. It **replaces** the scattered `filterPanel || classPanel || submenu || cropEditor`
    check (`main.ts` ~504). The union is **pure** (`isEngaged`, `toolbar-region-logic.ts`, unit-tested);
    its inputs are gathered from live CM/DOM state.
- **`live-preview-logic.ts`** (pure, tested) — `lineDecorations` (LP: a standalone line → its widget
  descriptor; SOURCE mode: highlights EVERY embed's `{…}` on the line as link syntax — **standalone AND
  inline**, since the whole-line `EMBED_LINE` would skip inline; returns brace-less `params`),
  `inlineEmbeds` (mid-text embeds), `rewriteWidth`, the
  `EMBED_LINE` / `INLINE_EMBED` matchers (now **span text-parsers, not the detection gate** — AD10
  below), and **`reduceReveal`** — the pure reveal-state reducer. `reduceReveal` takes the **mode**
  (`native|auto|always`), the **engaged** predicate (AD12 — `isEngaged`, *not* just the cursor line, the
  doc-comment + impl fix the rework demands), the **dismiss** state, and the cursor's position relative
  to the body / `{…}` spans; it returns whether the link shows and whether the dismiss **auto-clears**
  (only on full disengagement, native & auto; persists in always). `cycleRevealMode` is **gone**;
  `RevealMode` is the three-valued `native|auto|always` derived from `defaultRevealState` (AB19/F20) — no
  per-line mode cycle. `reduceReveal` also takes **`lineOf`** (maps each dismissed **embed** key back to
  its line) so the auto-clear works per-embed. The `<>` control is the per-**embed** **dismiss** (keyed by
  `e.attrEnd` via a `toggleReveal` StateEffect); it suppresses **link-only** via a per-embed
  `lie-suppress-native` MARK over the body span — no LINE decoration.
- **Embed detection derives from the parse (AD10).** The build no longer *gates* on `EMBED_LINE` /
  `INLINE_EMBED` walking `for i=1..doc.lines`: the **model** (whether/where a line holds an image embed)
  comes from **Obsidian's own parse** — the editor **`syntaxTree(state)`** live (`@codemirror/language`;
  already an esbuild external, add the dev-dep for types), its cached equivalent
  **`metadataCache.getFileCache(file).embeds`** for the reading-view path (position-precise, link + span,
  §4 CDP). A fenced/inline **code-block** `![](…)` is **excluded by construction** — the parse does not
  list it as an embed (CDP: 8 raw lines → 7 embeds, the fenced one typed `code`), so it needs **no special
  case** and stays literal code (no stand-in, no `{…}` mark, no widget). The regexes survive only as
  **text-parsers of an already-confirmed span** (extract alt / path / `{…}`). **Placement** —
  block-promoted bare vs own-cm-line `{…}` vs mid-text — is read from the **real CM elements** Obsidian
  inserts (model from the parse, placement from reality), choosing the `WidgetMode`. The **F20 "render
  images in code blocks"** setting (`renderImagesInCodeBlocks`, LP only, default off) is the lone
  override: when on, the plugin's **own fallback scan** re-includes code-section embeds (the inverse of
  the code-node check) and renders them; reading view renders nothing in code blocks either way.
- **Per-span visibility authority + one engagement predicate (AD11 / AD12).** For each parsed span the
  plugin is the single authority over the link (AB16b above): mirror native by default, **actively
  suppress** on dismiss (Bug 65), **pin** while engaged (Bug 86) — without disabling native editing
  (Lesson 11/12: the line is never replaced, only the tokens suppressed). "Engaged with the image" is the
  **one** `isEngaged` predicate (AD12) — the union cursor-on-line ∪ hover ∪ selected/active ∪
  panel-open(crop/filter/class/submenu) — centralizing the scattered `filterPanel || classPanel ||
  submenu || cropEditor` chain (`main.ts` ~504) that the reveal pin, the dismiss auto-clear and the
  toolbar greyed/active state all now read. The union is pure (`isEngaged`, `toolbar-region-logic.ts`,
  unit-tested); its inputs are gathered from live state.

### 3.4 Editing UI

- **`toolbar.ts`** — `buildToolbarElement` renders the ordered, divider-grouped bar from the shared
  `ToolbarItem[]` — the **ONE** toolbar, shown in **two presentations**: the EmbedWidget hosts it
  **in-chrome** on the box (`lie-toolbar-in-image`), and `ImageToolbar` **floats** the identical bar on
  `body` (`lie-toolbar-floating`) for a `.lie-float` image (inline / too-short). Only host + class differ;
  buttons, order and behaviour are the same by construction. The `<>` reveal is a **normal item**
  (leftmost, built in main's `toolbarItemsForImage`, action `toggleEmbedReveal`), so **both** presentations
  carry it identically; its per-show `is-off`/label reads the wrapper's `.lie-dismissed` class (a plain DOM
  signal set in the widget, since a dismiss flip already recreates the widget). Revealed on hover/selection,
  positioned `absolute` on the box (D1, D2). **D1.1 (too-small →
  above)** is a **CSS container query** on the box, no JS: *(CDP-verified)* `.lie-image-area
  { container-type: size }` + `@container (max-height: <bar height>) { .lie-toolbar { top: auto;
  bottom: 100% } }` flips the bar above at small sizes and is inert when large. (`container-type:
  size` needs a resolvable height — the box's `aspect-ratio`/explicit size provides it; a
  content-driven height would collapse under size containment, so use it only on the sized box.)
  *Folded-group popup (`openGroupPopup`):* a lightweight body-level palette, **coupled** to the
  image+toolbar region via `couplePaletteToRegion` (D6.4) so hovering it keeps the in-chrome bar
  visible (`.lie-region-hover` on the wrapper) and closes the popup when the region is left — **not**
  greyed (palettes are not modal). A single `closeGroupPopup` is the teardown for every path (button
  pick / toggle-off / click-away / Esc / region-leave; the detach hook clears the region binding +
  document listeners).
- **`region-hover.ts`** — the shared region-hover binder (AB11a / D6.2). `bindRegionHover(members,
  onActiveChange, grace)` treats N elements as ONE hover region: the region is active while the
  pointer is over ANY member, a short grace bridges the gaps (image→panel travel, toolbar→popup), and
  it is **robust to nesting** (a `Set` of the members the pointer is inside — moving toolbar→image,
  both inside the wrapper, stays "inside"; seeded from `:hover` at bind time so a move right after
  open is tracked, while synthetic CDP events drive it purely). `couplePaletteToRegion(palette,
  {wrapper, toolbar}, close)` wires a body-level palette in (marks the wrapper `.lie-region-hover`,
  closes the palette on region-leave), used by `openGroupPopup` and `addClass`. The pure click-away
  decision (`clickDismissesToolbar`) lives in `toolbar-region-logic.ts`.
- **`anchored-submenu.ts` (+ `-logic`)** — `AnchoredSubmenu` is the single host (AD8/D6/F14): the
  greyed toolbar, the header **reset · cancel (✗) · accept (✓)** icons, and the **one active
  region** (image + toolbar + panel bound to a shared hover/active state via `.lie-region-active`,
  driven by the shared `bindRegionHover` so the two show/hide together on ONE signal — never the CSS
  `:hover`, which is suppressed while a panel is open via `:not(.lie-toolbar-inactive)` so the bar
  stays greyed the whole open duration, D6.2). `close(exit)` routes the exit reason through the pure
  `submenuExitEffect` — **commit** (accept / Enter / leave / dismiss / context loss) → `onCommit`;
  **cancel** (✗ / Esc) → `onCancel` (owner re-renders the live DOM from the unchanged source, no
  write); **silent** (unload) → neither. `placeSubmenu` computes placement (compact under the
  toolbar; clamped into the viewport, never flipped past the explorer).
- **`crop-editor.ts` (+ `-logic`)** — `CropEditor` edits the LIVE 3-layer DOM **in place** (no
  clone), driving the SAME `toCropResult` placement the render core commits (centre origin →
  preview == committed); handles act on the inner `<img>` (corner aspect-locked + edge single-axis +
  rotate), the cut window + box fixed, the **result image staying clipped in-host** (no
  `contain:paint` lift) while a **body portal** carries the whole crop overlay for the crop duration.
  `snapTranslate` / `snapAngle` / `snapScale` quantize live (F12); `parsePlacement` is the pure
  round-trip inverse; auto-persist on leave.
  *Crop overlay portal:* with the host's `contain:paint` honoured, **anything** that must extend past
  the cut window is clipped in-host — so the portal carries BOTH the dimmed surround AND the handle
  chrome (handles + rotate knob); in-host keeps only the `.lie-frame` cut clip + the result `<img>`
  (the edit target, AB12). The portal is a body-level element (escaping the editor's `contain:paint`)
  carrying a **`clip-path` hole** over the cut window. The clip keeps the SURROUND and drops the result
  rect — a **frame**, which needs **two separate contours** (a huge outer rectangle + the result-box
  hole). `clip-path`'s single-contour shapes (`rect()` / `inset()` / a lone `polygon()`) only keep the
  *inside* of one region — exactly like `overflow:hidden` — so none of them can punch a hole; a single
  `polygon()` listing both rectangles joins them with diagonal edges that slice **triangular artifacts**
  into the surround. Only **`clip-path: path(evenodd, "<outer rect> <hole rect>")`** — two sub-contours
  with even-odd — keeps the OUTSIDE (a true hole). The hole's px size (the result box) is dynamic, so
  the `path()` is set **inline** on the veil (lint-OK: computed geometry), refreshed whenever the cut
  shape changes; the static parts stay in CSS. The hole sits on a **non-rotating wrapper**; the
  dimmed image rotates as its child (the cut window stays axis-aligned, `orientDeg` 0/90/180/270 only —
  free rotation rides the `<img>` `placementString`). **Seam guarantee:** the portal anchors to the
  **exact `getBoundingClientRect`** of the in-host `.lie-frame` (no rounding) and the **same transform
  string** drives the in-host `<img>`, the portal dim-img AND the handle box → no relative offset at
  fractional layout positions; re-anchored on scroll/resize via the `toolbar.ts`
  `positionAbove`/`reposition` pattern. The pan `pointerdown` binds to BOTH the in-host area
  (gestures started in the reserved space, falling through the hole) and the portal (the dim surround
  + the handles outside it); `pointermove`/`pointerup` already live on `activeDocument`. The dim
  surround **is the ghost image's own fade** — there is no overlay/scrim; the `clip-path` hole simply
  clips the ghost away over the result, so the in-host result shows through un-dimmed. The portal is
  removed on every `exitCropMode` path (the same teardown as the rotate-gesture listener).
  *macOS trackpad two-finger rotate:* on open the editor also subscribes Electron's native
  `rotate-gesture` window event (electron/electron#19294 — a continuous per-emission delta in
  degrees, CCW-positive), reached via the SAME `@electron/remote`.`getCurrentWindow()` path the
  export save-dialog uses (`macTrackpadWindow()` guards platform === darwin + remote reachable, else
  returns null). Each delta folds into the content rotation through the pure
  `applyRotateGesture(current, delta)` (negates the sign so a clockwise turn rotates content
  clockwise, then `snapAngle` — identical accumulate/quantize to the handle) and re-previews via the
  one `applyPlacement`. The listener is removed in `exitCropMode` — the single teardown the one
  `onClose` runs on **every** exit path (confirm + cancel/Esc/click-away/close) — so no listener
  leak. The rotate **handle** is untouched and stays the only rotation path off macOS / when remote
  is unreachable. Structural subscribe/unsubscribe + leak proof: `tests/cdp/verify-crop-teardown.mjs`
  (per exit path, listener count 0→1→0); the delta→sign→snap math is a unit (`applyRotateGesture`);
  the actual native firing is a manual user test (the gesture can't be synthesized via CDP).
- **`filter-panel.ts`** — `FilterPanel`: live histogram + sliders grouped by purpose + named
  presets; reads/writes the native `filter` value (its non-default keys via `nonDefaultFilter`);
  docked beside the image on the roomier side (D7).
- **`size-submenu.ts`** + **`size-submenu-logic.ts`** — `buildSizeBody`: the presets
  (icon/small/medium/large/original — `sizePresets`, where **icon couples to `inline`**, F24/F17) and
  the side-by-side width/height fields (D6.1), hosted by `AnchoredSubmenu`; the preset table is the
  pure unit (`tests/unit/size-submenu-logic.test.ts`).
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

- **`main.ts`** registers both adapters, `registerCommands` (`commands.ts`: image-specific
  commands `checkCallback`-gated via `canRun` on image context — `commandScope` resolves either a
  multi-image set (`selectionTargets` = embeds the editor selection overlaps, ≥2 ⇒ multi; pure core
  `spansOverlappingRanges`) or the single hover/cursor image (`resolveCommandImage`). Multi runs go
  through `modifyTransformMulti` (all `{…}` blocks in one transaction = one undo step); the
  interactive ones open centered standalone panels (`openMultiSize`/`openMultiFilters`/
  `openMultiClass`, `placement: "centered"`). Toolbar buttons call the single methods directly.
  Page-scope commands like `resetAllImages` register as a plain always-visible `callback`),
  `LieSettingTab` (`settings.ts`), and `StylesInjector`
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
  this runtime are **two callers of the same builder** (R0); the plugin wraps it in Obsidian's embed,
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
  keeping the bundle Obsidian-free). `tests/runtime-smoke.html` is the manual/CI browser fixture.
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
  size drift, overflow, or a resize frame offset. The **one sanctioned exception** is the
  block-fallback `.lie-wrapper-block`: a **2px padding reserve** on the resize marker's overhang
  sides keeps the **native** marker — whose `2px` accent outline bleeds past the image corner
  exactly like Obsidian's own (D4) — out of the block widget's `contain:paint` clip. **Padding
  only** — the block widget is over-constrained, so a compensating negative margin is *dropped* by
  the engine (verified: even `!important` resolves to `0`); the padding is absorbed by shrinking the
  content, so a full-width block image gives up 2px (0.3%, **D3-safe, no overflow**; standalone
  images carry no containment, untouched). The reserve only bites where the image edge meets the
  containment edge (full-width block on `inline-end`; caption-less block on `bottom` — a caption
  already extends the box past the marker). If that 2px ever matters, the alternative is a **body
  portal** for the marker (cf. AB12) — deferred for R0. Float via `:has()` on the embed, never the
  `img` or `.lie-image-area` → otherwise text never wraps.
- **AD5 (one path per mode).** The live-preview widget draws the plugin's own image and does **not**
  replace the line — block-replacing it was the old model; instead the native embed is kept (it loads
  the image and reveals the source) and CSS-suppressed **uniformly**. A `{…}` embed renders as an
  **inline** widget in its own **non-BFC** cm-line so a `lie-left`/`lie-right` `float` escapes and
  wraps (F18) — **not** a block widget below it; a **bare** embed renders as a `block:true` widget
  (block-promotion leaves no cm-line for an inline one). Because the bare case still needs a *block*
  decoration, it must be a `StateField`, not a `ViewPlugin` (the latter cannot emit block
  decorations). The `{…}` and the reveal are hidden/shown by **CSS** keyed on the **parse-derived reveal
  class** (set in-transaction, AD10/AB16b — not the retired `.cm-active` / `:has(> .cm-formatting)`
  guess), never by un-covering a range (which re-fires the native embed, Lesson 1) and never by a
  plugin-owned editable field. Inline mid-text embeds reuse the **same** widget, never a second
  widget. The reading-view reconcile must skip the plugin's own `.lie-wrapper`, or two passes
  re-measure at different widths.
- **AD10 (parse is the gate).** Do **not** re-introduce a regex / `EMBED_LINE` *gate* that decides "is
  this an embed" — that parallel representation is exactly what the rework removes (it re-creates the
  code-block doubling and the bare-embed miss, Bug 114). The gate is the parse (`syntaxTree` /
  `metadataCache.embeds`); the regex only parses a span the parse already confirmed. A code-block embed is
  **excluded by construction** — never special-cased back in except via the explicit F20 fallback scan.
- **AD11 / AD12 (one authority, one predicate).** The reveal pin, the `<>` dismiss auto-clear and the
  toolbar greyed/active state must read the **single** `isEngaged` predicate — never a fresh per-surface
  `filterPanel || classPanel || submenu || cropEditor` check (the drift the rework deletes). The dismiss
  suppression must **also** suppress the native raw link (Bug 65) and must **not** disable native editing
  (Lesson 11/12 — suppress the tokens, never replace the line). Decide stand-in vs native raw link by
  **mirroring Obsidian's reveal condition** (cursor within the parse span), never by observing its
  revealed DOM (`:has(> .cm-formatting)` — retired; it guesses, flickers and over-matches, Bug 106).
  **Prove no-flicker via CDP before shipping** the chosen reveal mechanism (D16/D17, §2.5).
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
