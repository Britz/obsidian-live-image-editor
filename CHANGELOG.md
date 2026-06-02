# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/Britz/obsidian-live-image-editor/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/Britz/obsidian-live-image-editor/releases/tag/0.1.0
