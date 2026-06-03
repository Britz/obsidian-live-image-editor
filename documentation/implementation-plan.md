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
| `src/transforms.ts` | AB1 Transform model | `ImageTransform`<br>`CropData` *(→ uniform geometry)*<br>`FilterData`<br>`parseAltText`<br>`serializeTransform`<br>`filterToVars` *(→ dropped, native filter)*<br>`temperatureAdjust`<br>`MARKER_CLASS`<br>`INLINE_CLASS` |
| `src/link-format.ts` | AB2 Link form & native-size normalization | `parseEmbedLine`<br>`buildEmbed`<br>`convertEmbedLine`<br>`desiredFormat` |
| `src/image-resolver.ts` | AB3 Source↔DOM mapping | `findImageInSource`<br>`updateImageSource`<br>`parseLocationTransform` |
| `src/snippet-scanner.ts` | AB4 Snippet class discovery | `scanSnippets`<br>`SnippetClass` |
| `src/renderer-logic.ts` | AB5 Geometry (pure) | `rotatedBox`<br>`cropBoxSize`<br>`estimatedBlockHeight` |
| `src/renderer.ts` | AB6 Uniform box & measurement + AB8 reading-view adapter | `applyTransformToImage`<br>`applyFilterVars`<br>`unwrapBox` |
| `src/caption-logic.ts` | AB7 Caption (text, pure) | `captionMarkdown`<br>`captionFromAlt` |
| `src/caption.ts` | AB7 Caption (DOM) | `createCaption`<br>`CaptionHandle` |
| `src/live-preview-logic.ts` | AB9 LP line→decoration (pure) | `lineDecorations`<br>`inlineEmbeds`<br>`rewriteWidth`<br>`EMBED_LINE` |
| `src/live-preview.ts` | AB9 Live-preview adapter (+ AB16 overlay + CSS native-suppression) | `createLivePreviewExtension`<br>`refreshDecorations` |
| `src/toolbar.ts` | AB10 Toolbar | `ImageToolbar`<br>`buildToolbarElement` |
| `src/anchored-submenu-logic.ts` | AB11 Sub-menu placement (pure) | `placeSubmenu`<br>`SubmenuPlacement` |
| `src/anchored-submenu.ts` | AB11 Shared sub-menu host | `AnchoredSubmenu` |
| `src/crop-editor-logic.ts` | AB12 Crop quantization (pure) | `snapTranslate`<br>`snapAngle`<br>`snapScale`<br>`toCropData` |
| `src/crop-editor.ts` | AB12 Crop editor | `CropEditor` |
| `src/filter-panel.ts` | AB13 Filter panel | `FilterPanel` |
| `src/size-submenu.ts` | AB14 Size sub-menu | `buildSizeBody`<br>`SizeState`<br>`SizePresets` |
| `src/export.ts` | AB15 Export | `renderTransformedImage`<br>`suggestExportPath`<br>`saveExport` |
| `src/commands.ts` | AB18 Commands | `registerCommands` |
| `src/settings.ts` | AB19 Settings | `LieSettingTab`<br>`LieSettings`<br>`DEFAULT_SETTINGS` |
| `src/styles-injector.ts` | AB20 Style injection | `StylesInjector`<br>`SIZE_CLASS_MAX` *(→ preset-width vars)* |
| `src/editing-toolbar-integration.ts` | AB22 Editing-toolbar integration | `getEditingToolbarStatus`<br>`addEditingToolbarButtons`<br>`removeEditingToolbarButtons` |
| `src/i18n/` | AB21 Localization | `index.ts`<br>`en.ts`<br>`de.ts` |
| `src/dev-bridge.ts` | AB23 Dev bridge | CDP relay (dev builds only) |

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

Canonical serialization (T2, AD2) — native CSS, classes only for what needs them:

```
![alt](path.png){.lie-img .lie-left style="transform: rotate(90deg) scaleX(-1); filter: brightness(1.2); width: var(--lie-size-medium)"}
```

- **Native CSS in `style=`** — the `transform` / `filter` **values pass through verbatim** to the
  img (a power user can drop in `skew()`, `perspective()`, extra `filter` functions … and they just
  work); the render path splits the `style` into declarations and routes each by **property name** —
  `transform` / `filter` → the **img**, `width` / `height` / `aspect-ratio` → the **box**. It does
  **one targeted read**: the **rotate angle**, to compute the box's auto `aspect-ratio` (the
  swapped intrinsic ratio for a quarter-turn). It needs **no presence check** (CSS precedence, §2.1)
  and does **not** parse the rest. A **crop** does not derive its box ratio from the transform — its
  **cut-frame `aspect-ratio`** is set by the crop editor (the user shapes the frame / edits the
  image within it, never typing a ratio) and written to the source on commit, overriding the auto
  default. Transforms use `transform-origin: center` (default). The pieces the editor writes:
  - **rotate + flip** → `transform: rotate(…) scaleX/Y(-1)`, **centered** — so a quarter-turn needs
    **no `translate`**; the box reshapes via its `aspect-ratio` (the swapped intrinsic ratio,
    derived at render).
  - **filters** → `filter: brightness(…) contrast(…) …`; `serializeTransform` maps `FilterData` ↔
    the `filter` functions, `temperatureAdjust` derives temperature (not stored, F10).
  - **size** → `width` / `height`: a **preset** is `width: var(--lie-size-small|medium|large)`
    (re-themeable; value in settings; falls back to `auto` where the var is undefined, F25); a
    **custom** size is a literal px.
- **Internal `lie-*` classes** (need CSS) — only: `lie-img` (`MARKER_CLASS`, marker), alignment
  (`lie-left/right/center`), inline (`lie-inline` = `INLINE_CLASS`). **No** size or decoration
  classes (size → `width` above; decoration → shipped snippets, F16).
- **Crop** is **fully native too** — the placement is the img's
  `transform: translate(<%>,<%>) rotate(<deg>) scale(<n>)` (translate in **%** → box-relative,
  responsive) and the box is `width` + `height` (the cut frame). **No custom property.** Example:

  ```
  ![alt](img.png){.lie-img style="width:320px; height:240px; transform: translate(-25%,-10%) rotate(12deg) scale(1.8)"}
  ```

  The wrapper's `overflow:hidden` does the clipping; the editor presents `scale` as w/h. Crop is
  still the **least-portable** feature (T3): a no-plugin renderer applies the transform without
  the wrapper clip, so it shows the image transformed and **unclipped** (and, with the explicit
  `height`, stretched) — acceptable, and no worse than any native transform without a clip.
- **The same block trails both link forms** (T2.1 Markdown, T2.2 wikilink) verbatim; conversion
  rewrites only the link, never the block.
- **`params` handed to `parseAltText` is the block CONTENT without the `{` `}` braces.** The
  model strips them; the reading-view capture group and `lineDecorations` both pass brace-less
  content. *(Pitfall §4 — leaving the braces silently drops the leading `.class` token.)*

### 2.3 DOM layers & sizing model

Three nested elements, outermost first — **the same for every image** (R0/AD3):

```
embed   — the flow container: Obsidian's own .image-embed (reading view) /
          the plugin's OWN overlay container .lie-wrapper in live preview (the widget draws its
          own, while Obsidian's native .image-embed/.image-wrapper stays in the document,
          CSS-suppressed, §2.4 — the suppression keys on the NATIVE .image-wrapper, NEVER on the
          plugin's own .lie-wrapper).
          The flow participant: alignment/float and native vertical spacing (D10) act here.
  ├ box  — .lie-rotate-box: the plugin's wrapper, ALWAYS present, AXIS-ALIGNED (never rotated).
  │        Box + img are ONE unit. It only RESIZES — to the rotated image's bounding box
  │        (reflow) — and clips; overflow:hidden is set unconditionally.
  │   └ img — img.lie-img: the image itself, and the ONLY element that is transformed
  │           (rotate / flip / filter / crop placement = translate+scale). Carries the marker class.
  └ caption — in the EMBED, BELOW the box — NEVER inside the box (overflow:hidden would clip it,
              which would drag back a pile of special rules and waste the native wins). Sized to
              the box width by the embed itself, not by JS.
```

The `{…}` block is authored on the image, so its classes/style land on the **img** in any
renderer (the box/embed are built by the plugin and do not exist without it). The plugin then
routes each value to the element it must act on:

| Acts on | Values | How |
|---|---|---|
| **img** | rotate, flip, filter, **crop placement** (translate+scale) | the img's own `transform` / `filter` (encoding: §2.2) |
| **box** | size (`width`/`height`), the crop **cut** (clip), rotation reflow | the wrapper, sized + `overflow:hidden`, by the render core |
| **embed** | alignment / float, inline | a class the CSS routes via `:has(img.lie-…)` |

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
image loads) plus the angle — by the pure functions in `renderer-logic.ts` (`rotatedBox`,
`cropBoxSize`) — and **applied to the DOM box, never written to the source** (writing it back would
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
`renderer.ts` and `export.ts` each carried their own crop math.)

### 2.4 The CSS contract (`styles.css`)

- **Transforms are native** — `style=` carries `transform` / `filter` directly, so no injected
  rule is needed to render them; they show even with no plugin and no theme CSS (T3).
- **`.lie-rotate-box`** is the always-present wrapper: `overflow: hidden` unconditionally. Its
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
  `:has(img.lie-left)` — never on the `img` (flex child) or the `.lie-rotate-box` (inside the
  embed). *(Pitfall §4.)*
- **Native-suppression (live preview)** — static, scoped rules hide Obsidian's native
  `.image-wrapper` while the plugin's overlay (`.lie-wrapper`) is shown; the rules **never** hit the
  plugin's own `.lie-wrapper`. The `{…}` block (real document text) is hidden when the image is
  rendered and shown when the line is active — keyed on `.cm-active` (fallback: native widget DOM
  presence via `:has()`). The reveal-for-looking "fake" raw link is shown/hidden by the same CSS —
  on hover/focus/`.cm-active`, by the `<>` toggle's transient class on the box, or by the **global
  default-state** class (the *default raw-link reveal state* setting, AB19/F20). **No reactive JS**
  does any of this — it is static classes the CSS keys on, not a measurement loop, not an edit field,
  and **not** a per-line AUTO/ON/OFF mode (AD5, AB16).
- Injected CSS carries **no** transform/filter rules (native) and **no** decoration classes
  (shipped as snippets, F16) — only the box, alignment routing, inline, the preset-width vars, and
  the live-preview native-suppression/reveal rules.

---

## 3. Per-layer realization

Mirrors `architecture.md` §4 (building blocks). Only the load-bearing functions are called out.

### 3.1 Model & source

- **`transforms.ts`** — `parseAltText` (block content → `ImageTransform`) and
  `serializeTransform` (the inverse); tokenizes on whitespace, reads `.class` and `key=value`
  tokens. The `transform` / `filter` declarations are kept as **pass-through strings** (routed
  whole to the img, not decomposed for rendering); the **editor** extracts only the one function
  it edits (targeted regex). The old `filterToVars` / `FILTER_VAR_NAMES` → `--lie-*` composing
  layer is **gone** (native `filter` *is* the final CSS). Round-trip and edge cases unit-tested
  (`tests/transforms.test.ts`).
- **`link-format.ts`** — `convertEmbedLine` rewrites the link form when `desiredFormat`
  (Obsidian's wikilink setting) differs, via Obsidian's `fileManager.generateMarkdownLink`,
  defensively (falls back to leaving the link as-is). It folds a Markdown native `|size` into
  the block and leaves a wikilink's native size in place (F5, F6).
- **`image-resolver.ts`** — `findImageInSource` maps a DOM `img` to its `{ line, ch }` range;
  `updateImageSource` rewrites that range only, leaving the cursor and scroll untouched (D11).
- **`snippet-scanner.ts`** — `scanSnippets` reads `.obsidian/snippets/*.css` via the vault
  adapter, pattern-matches image classes, filters out `lie-*` and Obsidian-internal classes,
  and re-runs on the file-watcher (F16, T6). The plugin also **ships example decoration snippets**
  it can install into `.obsidian/snippets/` on request (opt-in) and reset to the shipped version;
  once installed they are discovered like any other snippet (F16.1).

### 3.2 Render core

- **`renderer-logic.ts`** (pure, tested) — `rotatedBox` and `cropBoxSize` compute the box and the
  inner-image geometry as **pure functions of box size + transform** (no DOM measurement);
  `estimatedBlockHeight` (synchronous CM6 height estimate).
- **`renderer.ts`** — `applyTransformToImage` builds the one uniform `.lie-rotate-box` for every
  image (normal = degenerate transform) with `overflow:hidden`, sizes the box (size attr, else
  column-capped intrinsic) and sets the inner image from box + transform (**box → image**, §2.3);
  `unwrapBox` tears it down. Rotate/flip/filter are native CSS on the img, so there is no
  var-writing step.
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
- **`live-preview.ts`** — `createLivePreviewExtension` is a CM6 `StateField` at `Prec.highest`
  that, for each embed, draws an `EmbedWidget` **overlay** carrying the plugin's own transformed
  image (the uniform `.lie-wrapper`, R0/AD3): **block** mode for a standalone line and
  **inline** mode for a mid-text embed (`inlineEmbeds`) — one widget, two modes, the **same uniform
  chrome** (R0/AD3, AB9); only its **placement** differs between modes, never the chrome itself
  (F17). It does **not** replace the line — the line's text is left intact, so Obsidian's native
  embed still loads the image and provides its own cursor-reveal of the source; the native image is
  hidden by static scoped CSS (§2.4). Rebuilt on `docChanged` / selection change /
  `editorLivePreviewField` change.
- **Overlay + CSS native-suppression (AB16).** Both the suppression and the reveal follow from one
  CDP-verified fact: Obsidian builds its native embed from the **document syntax tree** (the raw
  `![[…]]` bytes), independent of our decorations, **and** performs its own cursor-reveal of that
  source as real document text when the caret enters the line. The plugin **embraces** that native
  embed rather than fighting it.
  - **Suppress native = static CSS, not coverage.** The widget overlays the plugin's own
    `.lie-wrapper` image; scoped CSS hides Obsidian's native `.image-wrapper` (never the plugin's own
    `.lie-wrapper`). The document text is **never** edited or covered — it stays the portable
    `![[…]]{…}` (F1) and the native embed keeps loading the file. (L1 still holds — an *un-replaced*
    line re-fires the native embed and would show `{…}` as literal text — but that is now **wanted**:
    we keep the native embed and CSS-hide it, rather than block-replacing the whole line.)
  - **Reveal-for-looking (F8)** is a display-only "fake" raw link the plugin paints (it knows the
    link) plus the `{…}`, shown/hidden **purely by CSS**. It shows on hover/focus/`.cm-active`, when the
    `<>` toolbar control toggles it (a **binary** show/hide that sets a transient class on the box —
    **not persisted per image**, F8), or when the **global default-state** setting (AB19/F20) is
    *shown*. There is **no** per-line AUTO/ON/OFF mode and **no** `cycleRevealMode` (per-image
    persistence would contradict F8's "not persisted per image"). **No reactive JS**, no plugin-owned
    **edit** field — just static classes the CSS keys on.
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
  decoration; returns brace-less `params`), `inlineEmbeds` (mid-text embeds), and `rewriteWidth`.
  (`RevealMode`/`cycleRevealMode` are **gone** — no per-line AUTO/ON/OFF. The `<>` control is a
  transient binary toggle: **Show** = follow the global default-state setting; **Hide** = suppress the
  reveal entirely, for layout testing — a class on the box the CSS keys on, F8.)

### 3.4 Editing UI

- **`toolbar.ts`** — `ImageToolbar` builds the ordered, divider-grouped bar (`buildToolbarElement`),
  revealed on hover/selection, positioned `absolute` on the box (D1, D2). **D1.1 (too-small →
  above)** is a **CSS container query** on the box, no JS: *(CDP-verified)* `.lie-rotate-box
  { container-type: size }` + `@container (max-height: <bar height>) { .lie-toolbar { top: auto;
  bottom: 100% } }` flips the bar above at small sizes and is inert when large. (`container-type:
  size` needs a resolvable height — the box's `aspect-ratio`/explicit size provides it; a
  content-driven height would collapse under size containment, so use it only on the sized box.)
- **`anchored-submenu.ts` (+ `-logic`)** — `AnchoredSubmenu` is the single host (AD8);
  `placeSubmenu` computes placement (compact under the toolbar; clamped into the viewport,
  never flipped past the explorer).
- **`crop-editor.ts` (+ `-logic`)** — `CropEditor` overlay; `snapTranslate` / `snapAngle` /
  `snapScale` quantize live during the drag (F12), `toCropData` emits the result.
- **`filter-panel.ts`** — `FilterPanel`: histogram + grouped sliders + temperature; reads/writes
  the native `filter` value; docked beside the image on the roomier side (D7).
- **`size-submenu.ts`** — `buildSizeBody`: the presets (icon/small/medium/large/original) and the
  side-by-side width/height fields (F24, D6.1), hosted by `AnchoredSubmenu`.
- **`export.ts`** — `renderTransformedImage` replays the **shared geometry** (`renderer-logic`) +
  the native `filter` + the same inner-image transform onto a canvas (canvas bounds clip =
  `overflow:hidden`), producing the **same visual** as displayed but sized from the **original
  image's native resolution** (F13, highest quality — the display `width` does not reduce it; the
  box geometry is scaled up to original pixels) — **no** separate crop/rotate block (removes the
  current `applyCrop` ↔ export duplication). Decoupled from `saveExport`; `suggestExportPath`
  pre-fills the next free `{name}-{n}` and prefers the native dialog (F13).

### 3.5 Plugin shell

- **`main.ts`** registers both adapters, `registerCommands` (`commands.ts`, `checkCallback`
  gated on image context), `LieSettingTab` (`settings.ts`), and `StylesInjector`
  (`styles-injector.ts`). `i18n/` follows the Obsidian locale. `editing-toolbar-integration.ts`
  is version-gated and off by default (F23, T10). `dev-bridge.ts` is tree-shaken from production.

---

## 4. Realization pitfalls (regression guards)

The concrete "do not" list each architecture decision translates to — and the failure each one
caused. These are the low-level half of the decisions in `architecture.md` §2.

- **AD3 (uniform element).** No `display:contents` "normal" case, no `width: max-content` on the
  wrapper, no padding on the wrapper box — each reintroduces a divergent path → rotated/normal
  size drift, overflow, or a resize frame offset. Float via `:has()` on the embed, never the
  `img` or `.lie-rotate-box` → otherwise text never wraps.
- **AD5 (one path per mode).** The live-preview widget **overlays** the plugin's own image and does
  **not** replace the line — replacing it block-style was the old model; instead the native embed is
  kept (it loads the image and reveals the source) and CSS-suppressed. The widget must be a block
  decoration (a `StateField`, not a `ViewPlugin` — the latter cannot emit block decorations). The
  `{…}` and the reveal are hidden/shown by **static CSS** keyed on `.cm-active`, never by un-covering
  a range (which re-fires the native embed, L1) and never by a plugin-owned editable field. Inline
  images reuse the same widget in inline mode, never a second widget. The reading-view reconcile must
  skip the plugin's own `.lie-wrapper`, or two passes re-measure at different widths.
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
