# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-06-05

### Fixed

- **Clicking outside an open filter/size panel now closes it.** The click-away
  boundary was the whole image+toolbar region, so clicking the image — which fills
  most of the canvas — left the panel stuck open. Clicking anywhere outside the
  sub-panel (the image included) now closes it and saves the change. The crop editor
  is unchanged: it still ends only via its own toggle / accept / cancel / Esc, so a
  stray click can't destroy an in-place crop session.

- **The standalone runtime now ships the default image-decoration classes.** The portable
  runtime (`lie-runtime.js` — used on the docs site and any non-Obsidian page) injected the
  core transform/filter CSS but not the plugin's bundled decoration snippet (`rounded` /
  `shadow` / `bordered` / `circle`), so class-styled example images rendered unstyled
  off-Obsidian. The shipped default snippet was extracted to an Obsidian-free module
  (`src/bundled-snippet.ts`) shared by the plugin and the runtime, and the runtime now
  injects it. Carrying a user's *modified* in-vault snippets is tracked as a future feature.
  (Note: `.bordered` uses an Obsidian theme variable that doesn't resolve off-Obsidian, so
  that one border may not paint on a foreign page.)

## [0.4.0] - 2026-06-05

A ground-up rework of how images render and how cropping works, a cleaner toolbar /
panel interaction, a real test suite and refreshed documentation.

### Added

- **In-place crop with edge handles** — the crop editor now edits the image right
  where it sits (no jump to a separate overlay), with four corner handles
  (aspect-locked), four edge handles (single-axis) and a rotate knob. What you see
  while cropping is exactly what gets committed.
- **Trackpad rotate gesture (macOS)** — rotate inside the crop editor with a
  two-finger trackpad twist, in addition to the rotate handle.
- **Portable runtime** — a tiny standalone script reproduces the rendering on a
  published page (e.g. MkDocs / Material), so rotate, flip, crop and filters show up
  outside Obsidian too. Align, width and filter are plain HTML attributes and already
  render natively without it.

### Changed

- **Uniform rendering model** — every image now renders through the same
  outer / frame / image structure, so normal, rotated, flipped, cropped, filtered and
  scaled images all follow one path and look identical in reading view and live
  preview. Rotating a cropped image no longer drifts out of place.
- **Cleaner stored format** — transforms are written as short bare keys, e.g.
  `{rotate=90 flip=horizontal width=300}`, instead of the old `{.lie-img style="…"}`
  block. Older blocks still parse, and align / width / filter are real HTML attributes
  so they survive in other renderers.
- **Toolbar and panel are one region** — while a crop / filter / size panel is open,
  the toolbar and the panel behave as a single hover region: the toolbar stays (greyed)
  instead of flickering away as you move onto the panel, and clicking away closes the
  panel (crop excepted). The accept (✓) / cancel (✗) icons are back; leaving a panel
  auto-persists as a single undo step, and Esc cancels.
- **Crop auto-persists** — leaving the crop editor commits the result as one undo step;
  the per-panel Reset reverts within the session.

### Removed

- **Temperature filter** — the temperature slider was never wired into the panel, so it
  has been retired. The seven filter sliders and five presets remain.

### Fixed

- A duplicated image (the same file embedded twice) now renders and edits the correct
  occurrence in both views, instead of always picking up the first one's transform.
- The "icon" size preset now renders the image inline as an icon, not merely at icon
  height.
- A filter-only image is now picked up by the portable runtime on a published page.
- The crop editor restores all of its temporary state on every exit (commit, Esc or
  click-away), so paint containment can no longer get stuck after a crop.
- Crop panning now grabs the whole image, both inside and outside the cut frame.

## [0.3.0] - 2026-06-04

A live-preview rework: images can float and wrap text, mid-paragraph images become
editable, and the raw-link reveal is simpler and calmer.

### Added

- **Inline image embeds** — an image placed mid-paragraph (not on its own line) now
  gets the same toolbar and transforms and flows inline with the surrounding text.
- **Float & text-wrap in live preview** — left- and right-aligned images now float and
  let the paragraph wrap around them in live preview, not only in reading view. A tall
  floated image (taller than roughly 250 px) stacks as a block instead, so it doesn't
  run off the line.
- **Native-look resize handle** — the resize corner now matches Obsidian's own native
  image handle.

### Changed

- **Simpler link reveal** — the `<>` raw-link control is no longer a tri-state
  ON / OFF / AUTO cycle. The default reveal state (auto on hover / cursor line, or
  always shown) is a single setting, and the per-image `<>` is now a transient dismiss
  that auto-clears — calmer, with no mode to remember.
- **Reveal is now pure-CSS** — the raw `{…}` link shows and hides via CSS keyed on
  hover and the cursor line, so it no longer fights the editor or churns the undo
  history while you edit the block.
- **Column-capped images** — a transformed image never overflows its column; it caps to
  the text width and stays responsive as the column narrows.
- **Standalone vs. inline placement** — an image on its own line sits as a block, while
  an image carrying a `{…}` block stays inline so it can float.

### Fixed

- The editing toolbar now appears on small and inline images, instead of being missing
  below a size threshold.
- The floating toolbar sits above very small images rather than covering them, and gets
  out of the way earlier.

## [0.2.0] - 2026-06-01

The second release: new captions and a proper export save dialog, a reworked toolbar
layout, and a round of fixes from in-Obsidian verification of the initial version.

### Added

- **Image captions** — an optional setting renders the image's alt text as a caption
  below the image (Markdown supported). Off by default.
- **Export save dialog** — saving an export now opens the OS-native save dialog at the
  original file's folder, with the name pre-filled as `{original}-{n}` (next free
  number). You can keep it, overwrite the original (or any file), or change the name
  and location entirely; on mobile it falls back to an Obsidian dialog. Nothing is
  ever overwritten silently.
- **Per-panel reset** — the size and crop sub-menus each have their own Reset that
  reverts only that panel's working state and keeps it open, separate from the
  toolbar's reset-all.
- **Custom-size height field** — the custom-size sub-menu now has width and height
  entries side by side (aspect ratio kept).

### Changed

- **Toolbar layout** — the `<>` link-reveal control moved to the far left (with a
  divider); it was previously at the far right. Buttons are grouped into clusters
  separated by dividers, and when space is tight the toolbar now wraps to multiple
  rows at those dividers — keeping each cluster intact — instead of folding the Edit
  group into a submenu. This works better on mobile. The Layout group stays a single
  submenu trigger.
- **AUTO link reveal** — in AUTO mode the link editor now also appears whenever the
  editor cursor is on the image's line, in addition to on hover.
- **Export fidelity** — export now renders every transform exactly as displayed:
  size, rotation, flip, crop and filters, with crop and rotation matching the
  on-screen result.
- **Resizing** — uses Obsidian's native corner handle, shown whenever the toolbar is
  and hidden in crop mode (where it collided with the crop frame's own resizing).
- **Image spacing** — stacked images now use Obsidian's native 6px vertical spacing.

### Removed

- The `+` / `−` size buttons were dropped from the toolbar; resizing is now via the
  resize handle and the custom-size sub-menu.

### Fixed

- AUTO link reveal now shows from the first render, instead of only after cycling the
  `<>` control back around to AUTO.
- Quarter-turn-rotated images size their reflow box correctly and stay responsive (a
  single render path, with no competing measurement passes).
- The filter panel docks beside the image, follows it on scroll and hides when it
  scrolls offscreen, instead of opening over the file explorer and sticking to the
  window.
- The crop editor no longer breaks when the image is dragged inside it.
- Filter-panel slider rows no longer overlap.
- The temperature slider's own thumb now stays where you put it instead of snapping
  back.
- Alignment classes (left / center / right) now actually float / align the image.
- The revealed link editor is borderless again — no frame, box-shadow, outline or
  background.
- An image with no explicit size no longer overflows its column.
- The resize / selection frame now hugs the image instead of sitting offset from it.
- Export no longer fails with "file already exists" (superseded by the new save
  dialog).
- The custom-size sub-menu's live preview works on plain (un-rotated, un-cropped)
  images again, not only on rotated or cropped ones.
- Resizing an image by height alone now keeps its aspect ratio when exported,
  instead of stretching it.
- Removing an alignment or decoration class from an image now takes effect
  immediately in reading view, instead of the old class lingering until a reload.
- The crop sub-menu's Reset restores the full image when you re-crop an
  already-cropped image.
- Reading-view captions no longer flicker or re-render on every editor update; an
  unchanged caption is left in place.
- The filter panel closes itself when its image scrolls out of view (e.g. in live
  preview), instead of lingering detached.
- A caption whose wikilink display ends in a size token (`![[img|caption|300]]`)
  now reads the same in live preview and reading view.
- Exporting an image whose filename contains a literal `%` no longer fails, and the
  export-name probe is bounded so it can't spin on a pathological folder.

## [0.1.0] - 2026-06-01

First public release. Non-destructive image editing for Obsidian: a hover toolbar
lets you crop, rotate, flip, resize and filter images, all live — the original
file is never modified. Edits are stored in a portable trailing `{…}` attribute
block, so the same notes still render correctly when published via MkDocs/Material.

### Added

- **Non-destructive editing** — all transforms are written to a trailing
  `{.lie-img style="…"}` block; the image file, alt text, path and native `|size`
  are never touched.
- **Rotate & flip** — quarter-turn rotation (clockwise / counter-clockwise) and
  horizontal / vertical flip. Rotated images keep the same content width as normal
  images and reflow correctly.
- **Crop** — in-place crop editor with a fixed, resizable frame over a movable,
  rotatable and scalable original. Free rotation snaps to whole pixels and 0.1°
  steps live during the drag, plus aspect presets 16:9, 4:3 and 1:1.
- **Resize** — drag the native corner handle (aspect ratio kept) or open the
  custom-size sub-menu for an exact width / height and the quick sizes
  small / medium / large / original.
- **Filters** — brightness, contrast, saturation, hue-rotate, blur, grayscale and
  sepia sliders plus a temperature approximation, with a live RGB histogram and
  the presets Sepia, B&W, Vintage, Cool and Warm.
- **Export** — render all transforms and filters to a new `{original}-edited.{ext}`
  file via canvas; the original stays untouched.
- **Preset classes** — built-in toggleable classes for size (small / medium /
  large), alignment (left / right / center / inline) and decoration (rounded /
  shadow / border / circle), with a one-click reset.
- **Vault-snippet classes** — image CSS classes are discovered from
  `.obsidian/snippets/` and offered in a dropdown; each is individually
  de-selectable in settings and refreshed on file changes.
- **Both views** — rotation, flip, filters, crop and sizing render identically in
  reading view and live preview.
- **Hover toolbar** — native Lucide icons, grouped Edit and Layout buttons that
  collapse into an overflow sub-menu when space is tight, and long-press support
  on mobile.
- **Anchored sub-menus** — size, crop and filter controls share one component:
  the toolbar greys out while a panel is open, confirm / cancel are icons, and
  Esc cancels without committing.
- **`<>` link reveal** — shows the raw link as editable text above the image and
  writes edits back live, with a per-image tri-state mode (ON / OFF / AUTO).
- **Follows Obsidian** — the markdown vs. wikilink form follows Obsidian's central
  "Use [[Wikilinks]]" setting, and the UI follows Obsidian's locale (English
  fallback, German included). Conversion between link forms keeps the transform
  block intact.
- **Commands** — context-aware commands (active only when an image is in context)
  for rotate, flip, crop, filters, sizing, alignment, add-class, reset,
  custom-size, toggle-inline and export.
- **Settings tab** — toggle the hover toolbar, manage detected snippet classes,
  and optionally enable the (off-by-default, version-gated) editing-toolbar
  integration.

[0.4.0]: https://github.com/Britz/obsidian-live-image-editor/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/Britz/obsidian-live-image-editor/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/Britz/obsidian-live-image-editor/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/Britz/obsidian-live-image-editor/releases/tag/0.1.0
