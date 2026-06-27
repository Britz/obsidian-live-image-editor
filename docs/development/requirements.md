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
  explicit platform-specific trigger. The chrome is **editor-only** (source / Live Preview): a click in
  **Reading view opens no toolbar** — reading view is read-only and every edit writes Markdown, so
  editing needs the editor (Decision 22).
- **F8 — Raw-link reveal.** A control **shows / hides** the raw link of the image. The reveal
  is triggered **either from the toolbar** (its `<>` reveal control) **or by the editor cursor**
  moving onto the image's line. The reveal is **not persisted** per image; the general
  *default reveal state* setting picks the natural mode, defaulting to **native** — the source is
  revealed only on **the active (cursor) line**, not always shown. The alternatives, *auto* reveals it additionally on **hover** and *always*, reveals it everywhere. The per-image `<>` toggle is a transient **dismiss** on top of
  the natural mode (auto-clears in native and auto mode).
- **F9 — Raw-link edit.** While revealed, the raw link is **editable text that writes edits
  back to the document** (the image updates live). It behaves like inline document text: the
  editor cursor can move **into** the field and edit it as if it were normal text.
- **F10 — Transform set.** Rotate (quarter-turns, both directions), flip (horizontal /
  vertical), free-rotation crop, resize (width, aspect ratio preserved) and image filters.
- **F11 — Filters.** Brightness, contrast, saturation, hue-rotate, blur, grayscale and sepia,
  each with a sensible range and default, plus named presets.
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
- **F14 — Shared editing sub-menu.** Crop, Filters and Resize all open through **one
  shared host element** — a modular component, not reimplemented per feature.
  **Export is not one of these live panels:** it raises the **OS-native save dialog** on desktop
  and an **Obsidian vault-path modal** on mobile, then writes the file directly (F13). While a panel is open
  the working state is a **live preview** only (no source write). The host carries three icon
  actions: a per-panel **reset**, a **cancel** (✗) and an **accept** (✓). **Accept** — and every
  other way of **leaving** the panel (Enter / click-away / dismiss / context loss) — persists the
  working state **once** as a single undo step (**auto-persist**). **Cancel** (✗) and **Esc**
  **discard** the edits (no source write) and restore the pre-open state by re-rendering from the
  unchanged source. Reset and cancel are the in-session reverts; Ctrl/Cmd-Z reverts after a commit.
  (Click-away counts as a leave for **filter** and **size**; the in-place **crop** session is exempt
  — it ends only via its own controls, D6.3 — but its persist model is identical: leaving persists
  once, ✗/Esc discards.)
- **F15 — Built-in layout (flat six states).** One built-in **layout** choice per image, a flat set
  of six mutually-exclusive states — **block-left / block-center / block-right** (own line, no wrap),
  **float-left / float-right** (margin, text wraps the side), **inline** (within a text line) — plus a
  reset that restores the default. Surfaced as six radio-style controls (exactly one active). Layout
  exists as a functional capability; how each state is carried on disk (attribute key vs CSS class) is
  an architecture concern, not a requirement. **Layout is orthogonal to size** (F24) and to decoration
  classes (F16): choosing a size never changes the layout state, and vice versa.
- **F16 — Vault-snippet classes.** Discover image CSS classes defined in the vault's own CSS
  snippets and offer them; each is individually de-selectable; the list refreshes on load and
  on change. The plugin also **ships example decoration snippets** (rounded, shadow, border,
  circle) that surface through the same mechanism — both a usable feature and a worked example
  of image CSS classes.
  - **F16.1 — Bundled snippets are opt-in.** The example snippets can be **installed from the
    settings** and are **not installed by default**. Since they are editable once installed, a
    **reset** restores them to the shipped version.
  - **F16.2 — Feature master toggle.** The whole snippet/decoration-class feature has a single
    on/off switch (the toolbar's class picker + the settings overview). Off leaves **alignment /
    inline** (core layout, F15) and any **already-applied** classes untouched — those still render
    via Obsidian's own enabled snippet, which the plugin does not inject.
  - **F16.3 — Class overview with provenance & status.** The discovered classes are presented
    grouped by **source file**, searchable, each with an enable toggle. Classes from the bundled
    file are **diffed against the shipped version**: *changed* and *deleted* classes are marked and
    offer a **per-class restore** (a deleted class still appears so it can be brought back). A class
    name active in **two** enabled snippets is flagged as a **collision** (last-loaded wins). A class
    repeated within one file lists once and does not collide with itself.
- **F17 — Inline (mid-text) images.** The **inline** layout state places an image within a line of
  text (icon-style) and renders it at its intended **inline size** in both views — not Obsidian's
  native full-size inline image. Inline is a layout state, chosen independently of the size preset
  (an in-text icon = inline layout + the `icon` size).
- **F18 — Float & text wrap.** The **float-left / float-right** layout states **float** the image so
  the surrounding text wraps around its side — in both reading view and live preview. (The
  **block-left / block-right** states align the image to a side WITHOUT wrapping — own line, text
  above and below.)
- **F19 — Commands.** Image-context commands for the transforms, sizing, the six layout states,
  add-class, reset and export (active only when an image is in context — the
  hover/click-active image, or, for command-palette/hotkey use where there is no hover, the image
  on the editor's **cursor line**). **Multi-image:** when the editor selection covers ≥2 image
  embeds, a command acts on **all** of them in one undo step — rotate/flip are relative (each from
  its own value), align/size are set; filters/custom-size/add-class open a **standalone centered
  panel ("N images")** that previews+commits to all; **crop and export stay single-image**. The
  toolbar buttons are always single (they target the hovered image). Plus **page-scope** commands
  that act on the whole note regardless of image context — currently **"Reset all images on this
  page"** (the still-backlogged flatten/export-page commands belong here too).
- **F20 — Settings.** A **General** group — hover toolbar, captions, the **default raw-link
  reveal state** (native / auto / always, F8; default: **native**), the **button-outlines** A11y mode
  (auto / always / never, D14), the tall-float cap, **render images in code blocks** (Live Preview only; default off) — kept compact; the
  **preset widths** for small / medium / large (F24); a **CSS-classes** section
  (the F16 master toggle, a link to Obsidian's snippet management, install/reset of the bundled
  example snippets (F16.1), and the grouped, searchable class overview (F16.2/F16.3)); and the
  optional editing-toolbar integration. When **no** CSS snippet is enabled in Obsidian, the
  CSS-classes section greys out and points the user to Appearance → CSS snippets.
- **F21 — Localization.** Follows Obsidian's language automatically, reusing the platform's
  own strings where possible, with an English fallback; no language setting of its own.
- **F22 — Captions.** The image's **alt text** is shown as a caption below the image,
  rendered as Markdown. Toggleable. The alt text stays the single source (no separate caption
  store); the native size suffix is not caption text.
- **F23 — Editing-toolbar command integration.** On request from the settings, the plugin's whole
  image toolbar (F19) is **added to** — and removed from — the separate *editing-toolbar* community
  plugin as **one submenu** ("Image editing"), not loose buttons. It is optional and **off by
  default**, and only offered for tested versions of that plugin (T10). The one settings entry adapts
  to the editing-toolbar's state: not installed → link to the plugin store; installed but disabled →
  link to plugin settings; enabled → the integration toggle.
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
  the **runtime-only** keys (`rotate`, `flip`, the inner crop `transform`, and a bare `filter=`)
  **degrade to the original, untransformed image** — inert but still visible (the `style="filter:…"`
  escape is the faithful alternative for a filter). This is the baseline that the storage
  and rendering choices (T2, T3) must satisfy.
- **F26 — Change image source (single embed).** Swap the underlying file of ONE embed for a different
  file **non-destructively**: only the embed's link target changes — the trailing `{…}` attribute block
  and the caption (alt text) are **kept**, so the new image inherits the existing transforms. (Formerly
  "Replace image / Replace all"; renamed 2026-06-12 per user decision — the old name misleadingly implied
  baking, and this link-swap is single-embed only.) **There is NO link-swap "replace all":** a note-wide
  "replace all images" means BAKING every image to its displayed result and stripping the `{…}` — that is
  the flatten path (**Feature 31**), not this requirement. The previous link-swap `Replace all` command
  is a defect → **Bug 105**.

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
- **D4 — Resize handle.** Resizing uses a resize handle, shown on hover, that is **visually
  indistinguishable from Obsidian's native image resize handle** — same corner placement and
  marker appearance (a fixed design constraint; the marker is **not** relocated or shrunk to ease
  implementation). The handle **must never be clipped**, including in layouts where the surrounding
  view would otherwise crop it. **While cropping the handle is hidden and inert** (sizing happens
  outside crop).
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
  - **D6.2 — One visibility signal.** The toolbar's visibility, its staying-**greyed**, and the open
    panel's visibility are all driven by the **same** "is the combined region hovered" signal — never
    by a second, competing one. While a panel is open the toolbar is greyed for the **whole** open
    duration (it is never momentarily un-greyed): hover-leave **hides** the toolbar+panel together
    (the panel stays open), hover-return shows them together, with no flicker or in-between state.
  - **D6.3 — Click-away closes (crop exempt).** While a **filter** or **size** panel is open, an
    **active click outside the sub-panel** closes it as a normal leave — it **persists** (auto-persist,
    one source write). The boundary is the **sub-panel itself** (plus the toolbar docked to it), **not**
    the whole region: clicking the **image** — which fills most of the canvas — closes the panel too
    (it is not a safe harbor). **Crop is exempt:** a stray click must never end an in-place crop
    session (clicks and drags on the image, handles and the dimmed pan-ghost are part of editing), so
    crop ends only via its **own** controls (the crop-button toggle, ✓ accept, ✗ cancel, Esc).
    Hover-leave is a separate path — it only hides, it never closes.
  - **D6.4 — Lightweight palettes are coupled, not greyed.** The folded-group popups and the
    add-class dropdown are **not** modal: they never grey the toolbar (it stays active/clickable).
    But their **visibility is coupled to the toolbar the same way** — image + toolbar + popup are one
    region: hovering the popup keeps the toolbar visible, and popup and toolbar fade **together** when
    the region is left.
  - **D6.1 — Resize panel contents:** the resize sub-menu shows the size presets (F24) and
    **manual width and height entry fields placed side by side**. (Its reset is the shared
    host's per-panel reset, part of F14.)
- **D7 — Filter panel.** A narrow panel docked **beside the image, on whichever side (left or
  right) has more room within the canvas**, with a live histogram at the top and vertical
  sliders grouped by purpose. The panel **tracks the image and hides when the image scrolls
  out of view**. The "more room" side is a **guarded flip measured within the editor pane**
  (excluding the sidebar), flipping only when
  the panel fits there — so it never spills over the file explorer (Bug 77).
- **D8 — In-place crop.** Activating crop keeps the image's exact size and position — **no
  jump or reflow** — and overlays the current state. Outside the frame is dimmed, inside is
  full opacity. The original has **corner** (aspect-locked, keeps the ratio), **edge** (single-axis)
  and **rotate** handles, plus scroll / pinch to scale; each corner/edge handle reshapes the cut window
  **from its own side** — only the grabbed corner/edge moves, the opposite side stays anchored
  (Decision 24). *(The current build still stretches the whole image on an axis instead — Bug 80.)* The cut window and the footprint **box stay fixed**
  during the session — the cut **shape** changes only via the aspect presets, and the box
  **size** is changed *outside* crop (the native resize handle D4 / the resize menu F24).
- **D9 — Caption appearance.** A borderless, muted, slightly smaller line centred below the
  image and **never wider than the image** (a long caption wraps within the image width); it
  tracks the image through resize and column changes.
  - **D9.1 — Too-small images:** when the image is too small to carry a caption below it (e.g. the
    inline icon), the caption is shown **on hover after a short delay**, like the tooltip on a
    toolbar icon.
- **D10 — Native spacing.** Vertical spacing between stacked images matches Obsidian's native
  rendering.
- **D11 — No disruption.** Toolbar edits and resizes never jump the scroll position. The editor
  cursor follows the edit — a single-image edit places the caret on its image's line (like
  Obsidian's own embeds), which also gives undo a sane anchor so cmd+Z does not scroll to the
  document top. Hovering never moves the cursor; only an actual edit does.
- **D12 — Icon set & brand.** The toolbar and editing-toolbar submenu use a **coherent, redesigned
  native-Lucide icon set** (e.g. filter `blend`, custom-size `image-upscale`, export `image-down`,
  CSS-classes `braces`, inline/block `wrap-text`, reset `eraser`, reset-all `copy-x`, layout
  `text-quote`), with documented fallbacks for the newer glyphs. The plugin carries a **brand /
  plugin icon** (a filled mark — spark over two bracketed mountains) used as the editing-toolbar
  submenu icon, the README and the docs logo/favicon (NOT a settings-tab header — that would violate R22).
- **D13 — Hover micro-animations.** Toolbar icons play **subtle hover/click micro-interactions**
  (e.g. rotate eases its turn, flip tips, crop snaps, reset/eraser wiggles, export bounces). They
  are **gated by `prefers-reduced-motion`** — when the user prefers reduced motion they are
  suppressed.
- **D14 — Button outlines (A11y).** A **"Button outlines"** accessibility setting controls visible
  outlines around the toolbar's icon buttons with three modes — **Auto / Always / Never**. **Auto**
  follows the platform: outlines appear when `prefers-contrast` (high contrast) or `forced-colors`
  is active, and are otherwise off. (Surfaced in Settings, F20.)
- **D15 — Selection frame.** A **selection frame** is shown on hover, outlining the image.
  **While cropping the frame stays visible**, outlining the bounds of the resulting (cropped)
  image, so the user always sees where the target image sits.
- **D16 — One link, never doubled.** *(F8)* The image's link source is never rendered more than
  once on screen at the same time — at any moment the user sees exactly one rendering of it, never
  two. Showing or hiding it is atomic: no in-between state, no flicker.
- **D17 — The link reveals as one whole.** *(F8)* When the link source is shown it appears complete
  and in one piece: the link together with any trailing `{…}` attribute block shows and hides as a
  single unit — never split, partial, out of sync, or flickering — no matter where on the link (link
  body or attribute block) the cursor sits.

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
    brevity is a hard requirement, T11): the layout key `align=left|right` (float, HTML-faithful) /
    `align=block-left|block-center|block-right` (block) — inline layout is carried as a **CSS class** (not a key);
    `width=N` / `height=N` (a pure px value is unitless, other units pass through — both round-trip as
    bare keys), `rotate=<deg>`, `flip=horizontal|vertical`, `transform="<2D-affine CSS transform>"`
    (the inner crop placement — pan / zoom / optional content-rotate), `filter="<CSS filter>"`,
    `aspect-ratio=<ratio>` (the footprint shape, stored **only** for a deliberate crop shape ≠
    original, AD6/T11), plus `.class` (built-in / vault-snippet / decoration classes, F16) and a
    `style="…"` power-user escape. Read-compat: legacy `align=center` (→ block-center) and **legacy alignment classes** still parse, migrating to the new form on next save. An optional **explicit claim-marker class** may be present. **Presets
    and `auto` sizing never co-emit `width=` and `height=`** (a derived height would distort the
    image); the **explicit custom-size path** (D6.1/F24), where the user types both fields, **may**
    emit both — a fixed width **and** height is deliberately non-responsive user intent, not a
    derived value. The bare keys carry a small, deliberately accepted collision risk (the
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
  - **Runtime-only keys** — `rotate`, `flip`, the inner `transform` (crop placement) and a bare
    `filter=` have **no faithful native-CSS path** (a `transform` does not reflow, so a rotated
    footprint needs an own element; a browser ignores a bare `filter` attribute — the faithful
    filter path is the `style="filter:…"` escape). They render only where the runtime bundle is
    injectable (e.g. MkDocs → full fidelity). Where it is not, they **degrade to the original
    image** (still visible, F25).
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
