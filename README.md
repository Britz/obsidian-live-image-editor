# Live Image Editor

Non-destructive image editing for Obsidian. Crop, rotate, flip, resize, and apply CSS filters — all live, without modifying the original file.

## Features

- **Toolbar on selection** — appears when you click an image, same trigger as Obsidian's native resize handles
- **Crop with free rotation** — fixed frame, freely move/rotate/scale the image underneath
- **CSS Filters** — brightness, contrast, saturation, hue, blur, grayscale, sepia with a side panel and live histogram
- **Filter Presets** — one-click looks (B&W, Vintage, Warm, Cool, Sepia, ...)
- **Resize** — scale up/down, custom dimensions, or predefined size classes
- **Flip & Rotate** — horizontal/vertical flip, 90° steps or free rotation via crop
- **Inline/Block toggle** — switch between text-wrapping and standalone display
- **CSS class management** — auto-detects classes from your vault's CSS snippets
- **Export** — render all edits to a new image file (original stays untouched)
- **Editing Toolbar integration** — optionally registers commands as buttons in [Editing Toolbar](https://github.com/pkm-er/obsidian-editing-toolbar)
- **Multilingual** — follows Obsidian's language setting

## How it works

Edits are stored as a small, portable attribute block **after** the image embed — standard
Markdown/wiki syntax, never the alt text or the file. The original image is never touched.

```markdown
![A caption](photo.png){rotate=90 width=420}
![[photo.png]]{align=left filter="sepia(0.8)"}
![square](photo.png){transform="translate(-50%,-50%) scale(2)" aspect-ratio=1/1 width=260 .rounded}
```

The block uses bare keys (`align`, `width`, `rotate`, `flip`, `transform`, `filter`,
`aspect-ratio`, `.class`) — the same portable format MkDocs-Material / Python-Markdown / Pandoc
understand. Open the note **without** the plugin and the image still shows: `align`/`width` carry
through any renderer, and the rest fall back to the original, untransformed image. Obsidian's native
wiki-link size (`![[image.png|300]]`) continues to work and is preserved.

## Documentation

- **[User guide](docs/user-guide.md)** — how to use every feature, with screenshots.
- **[`examples/`](examples/)** — a demo vault that shows each feature on real images
  (open it as a vault with the plugin enabled; start at *00 — Start here*).
- **[`documentation/`](documentation/)** — the design docs (requirements, architecture, plan,
  tests, the bug & lesson registry).

## Installation

1. Download the latest release from [Releases](https://github.com/Britz/obsidian-live-image-editor/releases)
2. Extract into your vault's `.obsidian/plugins/live-image-editor/` directory
3. Enable the plugin in Settings > Community Plugins

## Building from source

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/live-image-editor/`.

## Development

```bash
npm run dev
```

This starts esbuild in watch mode. Symlink or copy the output into your test vault for live reloading.

## License

[MIT](LICENSE)
