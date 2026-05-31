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

Edits are stored as parameters in standard Markdown image syntax. The original file is never touched.

```markdown
![rotate:90 flipH lie-small](photo.png)
![crop:20,10,260,180,15,1.2 brightness:1.1](photo.png)
![lie-center lie-shadow 400x300](photo.png)
```

Obsidian's native wiki-link syntax (`![[image.png|300]]`) is not affected and continues to work as expected.

## Installation

1. Download the latest release from [Releases](https://github.com/Britz/obsidian-live-image-menu/releases)
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
