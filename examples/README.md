# Examples

Committable demo assets for the README and manual testing — no third-party content.

- `images/` — synthetic sample images (`sample-landscape.png` 3:2, `sample-portrait.png` 2:3, `sample-square.png` 1:1). Corner labels `A B / C D` and a **TOP** marker make rotation/flip obvious in screenshots.
- `Live Image Editor Demo.md` — a note exercising every feature (rotate, flip, filters, crop, resize, preset classes) via the portable `{…}` attribute blocks.
- `generate-samples.sh` — regenerates the images with ImageMagick (`bash generate-samples.sh`). Set `LIE_FONT` to override the font path.

## Taking screenshots

1. Open this `examples/` folder as a vault in Obsidian (or copy the note + `images/` into your dev vault) with the plugin enabled.
2. Open *Live Image Editor Demo*. Hover an image to reveal the toolbar; the `{…}` blocks already show each transform rendered.
3. Capture the toolbar, filter panel, crop overlay and reading-view results for the README.
