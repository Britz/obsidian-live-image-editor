# Requirements — Live Image Editor

> The requirements artifact — the **High-level concept** from `methodology.md`: *what* to
> build and the *guardrails* for building it, stated independently of how the code achieves
> them. Code internals appear only where the framework (Obsidian / JavaScript / HTML / CSS)
> forces them. Requirements is the umbrella; it specializes into **Functional**, **Design**
> and **Technical**.
>
> This is an evolving high-level pass. Prune anything that is actually an implementation
> detail, and add what is missing.

The plugin edits images **non-destructively** in Obsidian via a hover toolbar: rotate, flip,
crop, resize, filter and export, plus predefined or vault-snippet CSS classes and Markdown
captions. It follows Obsidian's locale and its central "Use [[Wikilinks]]" setting; it adds
no language or link-format setting of its own.

---

## Functional Requirements — *what it does*

- **F1 — Non-destructive.** The original image file is never modified. Every edit is stored
  in a portable trailing attribute block on the image's Markdown; the link, alt text and
  native size suffix are never repurposed.
- **F2 — Source is the truth.** The displayed image always reflects the **current** Markdown
  source. No stale or cached render state survives — e.g. after switching between reading
  view and live preview, or when Obsidian reuses cached embed DOM.
- **F3 — The attribute block is never shown as text.** In both views the trailing `{…}` block
  is consumed by the renderer and never displayed as literal text beside the image.
- **F4 — Both views.** Every transform renders identically in reading view and in live
  preview.
- **F5 — Link form follows Obsidian.** Whether a Markdown or a wiki link is used follows
  Obsidian's central "Use [[Wikilinks]]" setting; switching it converts the link while
  keeping the transform block intact and correct.
- **F6 — Native size folded into the block.** When an image **was** resized via Obsidian's
  native handle — which writes a `|size` into a **Markdown** link (e.g. `![alt|513](path)`) —
  that size is folded into the portable attribute block. This covers a size **already present**
  in the source (written before the plugin took over the image, or by another editor): while
  the plugin is active it owns resizing, so no *new* native size is written. A **wikilink**'s
  native `|size` (e.g. `![[path|513]]`) is left as written, since it is already the
  conventional Obsidian form.
- **F7 — Toolbar activation.** The editing chrome appears for an image that is **selected**
  (tap or click — on any platform, mobile or desktop) and on **hover** wherever the
  environment supports hovering (a desktop pointer, or a pen that reports hover). There is no
  explicit platform-specific trigger.
- **F8 — Raw-link reveal.** A control **shows / hides** the raw link of the image. The reveal
  is triggered **either from the toolbar** (its `<>` reveal control) **or by the editor cursor**
  moving onto the image's line. The reveal is **not persisted** per image; the general
  *default reveal state* setting picks the natural mode, defaulting to **auto** — the source is
  revealed only on **hover or the active (cursor) line**, not always shown. (The alternative,
  *always*, reveals it everywhere.) The per-image `<>` toggle is a transient **dismiss** on top of
  the natural mode (auto-clears in auto mode).
- **F9 — Raw-link edit.** While revealed, the raw link is **editable text that writes edits
  back to the document** (the image updates live). It behaves like inline document text: the
  editor cursor can move **into** the field and edit it as if it were normal text.
- **F10 — Transform set.** Rotate (quarter-turns, both directions), flip (horizontal /
  vertical), free-rotation crop, resize (width, aspect ratio preserved) and image filters.
- **F11 — Filters.** Brightness, contrast, saturation, hue-rotate, blur, grayscale and sepia,
  each with a sensible range and default; named presets; and a *temperature* control that
  approximates warmth by nudging the other values (it is not stored on its own).
- **F12 — Crop.** A movable, rotatable and scalable original under a resizable frame, with
  aspect-ratio presets. The cut quantizes to whole pixels and fixed angle steps **live during
  the interaction**, so it can never fall mid-pixel.
- **F13 — Export.** Render all transforms and filters (rotate, flip, crop, filters) — the same
  **visual** result as displayed — to a new image file, at the **highest sensible resolution:
  computed from the original image's native resolution**, *not* the (possibly down-scaled) display
  size. So a crop of a 4000 px original exports the cut region at full original pixels; the `width`
  the user set for display never reduces export quality. Saving offers the OS-native save dialog
  (desktop) at the original file's folder with a free name pre-filled; the user may keep it,
  overwrite, or relocate. It never overwrites silently, and falls back to an in-app dialog where no
  native one is reachable (mobile).
- **F14 — Shared editing sub-menu.** Crop, Filters, Export and Resize all open through **one
  shared host element** — a modular component, not reimplemented per feature. While a panel is open
  the working state is a **live preview** only (no source write). The host carries three icon
  actions: a per-panel **reset**, a **cancel** (✗) and an **accept** (✓). **Accept** — and every
  other way of **leaving** the panel (Enter / click-away / dismiss / context loss) — persists the
  working state **once** as a single undo step (**auto-persist**). **Cancel** (✗) and **Esc**
  **discard** the edits (no source write) and restore the pre-open state by re-rendering from the
  unchanged source. Reset and cancel are the in-session reverts; Ctrl/Cmd-Z reverts after a commit.
- **F15 — Built-in alignment & inline.** Built-in, toggleable **alignment** (left / right /
  center) and **inline** styling, plus a reset that restores defaults. Alignment exists as a
  functional capability; whether it is carried as an attribute key or a CSS class is an
  architecture concern, not a requirement. (Size is applied as a width — F24; decoration ships as
  example snippets — F16.)
- **F16 — Vault-snippet classes.** Discover image CSS classes defined in the vault's own CSS
  snippets and offer them; each is individually de-selectable; the list refreshes on load and
  on change. The plugin also **ships example decoration snippets** (rounded, shadow, border,
  circle) that surface through the same mechanism — both a usable feature and a worked example
  of image CSS classes.
  - **F16.1 — Bundled snippets are opt-in.** The example snippets can be **installed from the
    settings** and are **not installed by default**. Since they are editable once installed, a
    **reset** restores them to the shipped version.
- **F17 — Inline (mid-text) images.** An image placed within a line of text (icon-style, via
  the inline class) renders at its intended **inline size** in both views — not Obsidian's
  native full-size inline image.
- **F18 — Float & text wrap.** Left / right alignment **floats** the image so the surrounding
  text wraps around it — in both reading view and live preview.
- **F19 — Commands.** Image-context commands for the transforms, sizing, alignment,
  add-class, reset, inline toggle and export (active only when an image is in context).
- **F20 — Settings.** General toggles — hover toolbar, captions, and the **default raw-link
  reveal state** (auto / always, F8; default **auto**); the **preset widths** for small / medium / large (F24);
  the detected-snippet list with per-class toggles plus **install / reset of the bundled example
  snippets** (F16.1); and the optional editing-toolbar integration.
- **F21 — Localization.** Follows Obsidian's language automatically, reusing the platform's
  own strings where possible, with an English fallback; no language setting of its own.
- **F22 — Captions.** The image's **alt text** is shown as a caption below the image,
  rendered as Markdown. Toggleable. The alt text stays the single source (no separate caption
  store); the native size suffix is not caption text.
- **F23 — Editing-toolbar command integration.** On request from the settings, the plugin's
  image commands (F19) can be **installed into** — and removed from — the separate
  *editing-toolbar* community plugin's bar, so they appear as buttons there. It is optional and
  **off by default**, and only offered for tested versions of that plugin (T10).
- **F24 — Size presets.** A defined set of one-tap size presets is offered: **icon, small,
  medium, large, original**. *small / medium / large* set the corresponding **preset width**
  (configurable in settings, F20) through the **same width mechanism** as a custom width — not a
  separate class; *icon* sets the inline size (F17); *original* clears the explicit width back to
  the image's natural width.
- **F25 — Never emit plugin-only Markdown (graceful degradation).** Every piece of Markdown the
  plugin writes must stay a **valid image embed that still renders the image without the
  plugin** — in Obsidian with the plugin disabled, or in another Markdown / wiki renderer.
  Without the plugin the image may not carry its formatting, but it is **always displayed**;
  the plugin never produces markup that breaks the embed or hides the image. Specifically, the
  native-CSS-faithful keys (`align`, `width`, `style="filter:…"`) survive in any renderer, while
  the **runtime-only** transforms (`rotate`, `flip`, the inner crop `transform`) **degrade to the
  original, untransformed image** — inert but still visible. This is the baseline that the storage
  and rendering choices (T2, T3) must satisfy.

---

## Design Requirements — *how it looks and feels*

- **D1 — Toolbar placement.** Sits at the top of the image and scrolls with it (not
  page-fixed), inset from the edge, with native icons and sensible spacing. (When it appears
  is F7, not a design concern.)
  - **D1.1 — Too-small images:** when the image is too small to hold the bar (e.g. the inline icon),
    the toolbar cannot sit inside it and is shown **above** the image instead.
- **D2 — Order & grouping.** A defined left-to-right button order, with related buttons
  grouped and separated by dividers. When horizontal space runs out the toolbar **first folds
  groups into a submenu trigger** (Layout before Edit) and **only then wraps at the dividers**
  (each group stays intact, never clipped) — mobile-friendly. "Too little space" is measured against
  the **image width** while the bar fits inside it, and against the **window** once it extends past
  the image.
- **D3 — Responsive & column-capped.** Every image — including rotated and cropped — scales to
  the available text column and **never exceeds it** (Obsidian has no horizontal scroll), and
  stays responsive to column and window resize.
- **D4 — Resize affordance.** Resizing uses Obsidian's **native resize handle**, shown on
  hover and hidden while cropping. On a rotated image the dragged width is the **bounding-box
  width**, so the handle behaves intuitively.
- **D5 — Raw-link reveal appearance.** The editable raw link (F8) reads like a normal document
  line above the image: borderless, full content width, auto-height (wraps fully, never
  clipped), never a boxed or resizable text field.
- **D6 — Sub-menu appearance.** While the shared sub-menu (F14) is open, the toolbar is
  **greyed out and inactive**, and the host's **reset**, **cancel** (✗) and **accept** (✓) actions
  are shown as **icons** (leaving still persists — auto-persist, F14). Placement is the only thing
  that varies by size — compact menus hang under the toolbar, the large filter panel sits beside the
  image — and the menu is never clipped or internally scrolled. **Image + toolbar + the open panel
  form one continuous active region:** the toolbar (greyed) and the panel stay visible while the
  pointer is anywhere in that region — including the gap while moving from the image to the panel —
  and they show and hide **together** when it is entered / left.
  - **D6.1 — Resize panel contents:** the resize sub-menu shows the size presets (F24) and
    **manual width and height entry fields placed side by side**. (Its reset is the shared
    host's per-panel reset, part of F14.)
- **D7 — Filter panel.** A narrow panel docked **beside the image, on whichever side (left or
  right) has more room within the canvas**, with a live histogram at the top and vertical
  sliders grouped by purpose. The panel **tracks the image and hides when the image scrolls
  out of view**.
- **D8 — In-place crop.** Activating crop keeps the image's exact size and position — **no
  jump or reflow** — and overlays the current state. Outside the frame is dimmed, inside is
  full opacity. The original has corner (aspect-locked), edge (single-axis) and rotate
  handles, plus scroll / pinch to scale. The cut window and the footprint **box stay fixed**
  during the session — the cut **shape** changes only via the aspect presets, and the box
  **size** is changed *outside* crop (the native resize handle D4 / the resize menu F24).
  *(Realized in place on the live 3-layer DOM — no clone; the frame/area `overflow:hidden` and
  the host `contain:paint` are lifted for the crop duration. See issues.md → Resolved by the
  crop-editor in-place rework.)*
- **D9 — Caption appearance.** A borderless, muted, slightly smaller line centred below the
  image and **never wider than the image** (a long caption wraps within the image width); it
  tracks the image through resize and column changes.
  - **D9.1 — Too-small images:** when the image is too small to carry a caption below it (e.g. the
    inline icon), the caption is shown **on hover after a short delay**, like the tooltip on a
    toolbar icon.
- **D10 — Native spacing.** Vertical spacing between stacked images matches Obsidian's native
  rendering.
- **D11 — No disruption.** Toolbar edits and resizes never jump the scroll position and never
  move the editor cursor.

---

## Technical Requirements — *how it must be built*

- **T1 — No runtime dependencies.** The crop editor, histogram and export are built in-house
  (canvas-based); no third-party runtime libraries.
- **T2 — Portable storage.** Transforms live only in the trailing `attr_list` attribute block
  — the **same** mechanism for both link forms, portable to Python-Markdown / MkDocs-Material /
  Pandoc. The block trails the embed in **both** link forms:
  - **T2.1 — Markdown:** `![alt](path.png){…}`
  - **T2.2 — Wikilink:** `![[path.png]]{…}` — and with a native size suffix: `![[path.png|240]]{…}`
  The trailing block attaches to a **wikilink** as well, not only a Markdown link — verified for
  Pandoc (with its wikilinks + link-attributes extensions: `[[target|display]]{.class id="…"}`).
  Transform data is **never** hidden inside the wikilink pipe (that carries only the native
  alias / size) — so no pipe-encoding tricks. Where a renderer does not understand the trailing
  block, it is shown as text but the image still renders (F25). Alt text, path and native size
  are never repurposed; the link type is preserved exactly as written.
  - **T2.3 — Block grammar (target).** The block is a Material-/MkDocs-style attribute list of
    **bare keys** (no `lie-` prefix — the block is hand-edited plain text in the Markdown, so
    brevity is a hard requirement, T11): `align=left|right|center`, `width=N` (unitless px),
    `rotate=<deg>`, `flip=horizontal|vertical`, `transform="<2D-affine CSS transform>"` (the
    inner crop placement — pan / zoom / optional content-rotate), `filter="<CSS filter>"`,
    `aspect-ratio=<ratio>` (the footprint shape, stored **only** for a deliberate crop shape ≠
    original, AD6/T11), plus `.class` (built-in / vault-snippet / decoration classes, F16) and a
    `style="…"` power-user escape. An optional bare `.lie` is an explicit claim marker. **Never**
    write `width=` and `height=` together (that distorts the image); a `height` is reached only
    through `style="…"`. The bare keys carry a small, deliberately accepted collision risk (the
    brevity trade-off). The same grammar is the single format read by all consumers (T3).
- **T3 — Portable rendering.** The stored markup must still render the image *with* its
  transforms in a compatible static-site theme **without** the plugin (the same notes are
  published via a static-site generator). This requires the rendering contract to be
  declarative. Portability is achieved by the plugin's **own framework-free JS + CSS bundle**
  (the read-render core, T4/T5, lifted out as a standalone runtime), **not** by relying on theme
  CSS. The format splits into two fidelity tiers:
  - **Native-CSS-faithful subset** — `align` (legacy HTML `align` float / center) and `width`
    (a real HTML attribute the browser honours) render correctly with **no plugin and no shipped
    CSS at all**; a `style="filter:…"` escape likewise survives faithfully.
  - **Runtime-only transforms** — `rotate`, `flip` and the inner `transform` (crop placement)
    have **no faithful native-CSS path** (a `transform` does not reflow, so a rotated footprint
    needs an own element); they render only where the runtime bundle is injectable (e.g. MkDocs →
    full fidelity). Where it is not, they **degrade to the original image** (still visible, F25).
  Where the bundle can be injected the result is 100% faithful; otherwise the no-JS fallback
  keeps `align`/`width` and shows the original image for the runtime-only transforms. kramdown /
  Jekyll do **not** attach a bare-brace `{…}` block to an image at all — an explicit, documented
  limitation (the image shows, unformatted). *(Implemented — the bare-key format ships, and the
  framework-free runtime bundle `lie-runtime.js` hydrates claimed images on a foreign page; the
  no-JS fallback keeps `align`/`width` and degrades the runtime-only keys to the original image.)*
- **T4 — Two render paths, one result.** Reading view (a Markdown post-processor) and live
  preview (a CodeMirror-6 editor extension) are separate paths *because Obsidian renders the
  two modes differently*; both must produce the same DOM structure and the same visual result.
- **T5 — Uniform wrapper.** **Every** image uses the **same** wrapper / widget element;
  normal, rotated, flipped, cropped, filtered and sized are **not distinguished** — one
  structure, one sizing path. "Normal" is just the degenerate transform, never a special
  case. This structural uniformity is what makes every image behave like a native embed and is
  the permanent guard against the recurring rotated-image sizing drift: there is no separate
  path that can fall out of sync.
- **T6 — One path per mode.** Within a single mode, an image is rendered and measured by
  exactly one path; no competing or double passes.
- **T7 — Robustness.** Rendering and measurement converge to the correct result across the
  conditions Obsidian runs in: asynchronous or cached image loading, reused embed DOM, mode
  switches, and a **backgrounded or hidden window** (where animation frames are throttled). No
  image is left mis-sized, unrendered, or with a leftover artifact.
- **T8 — Testable by extraction.** Decision logic is extracted into pure, framework-free units
  that are unit-tested; integration and behaviour are verified in the running app.
- **T9 — Naming & conventions.** The plugin id must not contain "obsidian" (the GitHub repo, by
  contrast, **is** `obsidian-live-image-editor`); internal CSS classes carry a dedicated prefix;
  image-context commands share one prefix; the shipped linter configuration is kept as-is; and
  decision logic is written in pure `*-logic.ts` units (T8) — no third-party runtime libraries (T1).
- **T10 — Optional editing-toolbar integration.** Off by default and version-gated — enabled
  only for tested versions of the other plugin, with a warning otherwise.
- **T11 — Robust to hand-edited / partial source.** The Markdown is editable in any text editor,
  so the plugin must assume any stored value can be **missing, partial, or hand-changed** and
  still render **sensibly** — never break (0-size, garbage, leftover artifact). The **original
  image's intrinsic ratio is the ground truth** and is always available (a property of the file);
  the plugin **computes what it can** from it (+ the transform) and **stores only genuine,
  non-derivable user intent** — a *deliberate aspect change*: a distorting resize, a width+height
  set via the modal, or a crop frame whose shape differs from the original. Every stored value has
  a sensible fallback to the ground truth (a missing aspect → the original, un-distorted).
