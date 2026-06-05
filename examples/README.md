# Examples — demo vault

A self-contained Obsidian vault that demonstrates every Live Image Editor feature on synthetic,
committable images (no third-party content). Open this folder as a vault with the plugin enabled and
start at **[[00 — Start here]]**.

## Pages

- `00 — Start here.md` — overview, how to use, what to enable.
- `01 — Rotate & flip.md` · `02 — Crop.md` · `03 — Size & presets.md` · `04 — Filters.md` ·
  `05 — Layout, float & wrap.md` · `06 — Captions.md` · `07 — Classes & snippets.md`.

Every block uses the plugin's portable **bare-key** format (`{rotate=90 width=300}`,
`{filter="sepia(0.8)"}`, `{align=left width=180}`, …); with the plugin disabled the image still
renders (the native-faithful `align`/`width` survive, the rest fall back to the original).

## Assets

- `images/` — synthetic samples: `sample-landscape.png` (3:2), `sample-portrait.png` (2:3),
  `sample-square.png` (1:1), `tiny-24.png` (a 24 px icon). Corner labels **A B / C D** and a **TOP**
  marker make rotation/flip obvious in screenshots.
- `generate-samples.sh` — regenerates the images with ImageMagick (`bash generate-samples.sh`); set
  `LIE_FONT` to override the font path.
- `.obsidian/snippets/` — the bundled decoration snippets (`live-image-editor-examples.css`) and a
  float helper, installed + enabled so [[07 — Classes & snippets]] works out of the box.

## Screenshots for the docs

The user-guide images live in `docs/img/` (repo root); see `docs/user-guide.md`. They are captured
from this vault in Live Preview via the Chrome DevTools Protocol (`scripts/obsidian-debug.mjs` +
`Page.captureScreenshot`).
