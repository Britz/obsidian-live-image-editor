# Live Image Editor

Non-destructive image editing for **[Obsidian](https://obsidian.md)** — rotate, flip, crop (with
free rotation), resize, filter and export images straight from a hover toolbar. The original image
file is **never** modified; every edit is stored as a small portable `{…}` block on the image's
Markdown line.

The images on these pages are not screenshots — they are rendered live in your browser by the
plugin's own [standalone runtime](development/architecture.md), the same code that draws them
inside Obsidian.

<figure markdown="span">
  ![A landscape sample rotated 90°](examples/images/sample-landscape.png){ rotate=90 width=260 }
  <figcaption><code>![](sample.png){rotate=90 width=260}</code> — rendered live, not a screenshot.</figcaption>
</figure>

## Where to go

<div class="grid cards" markdown>

-   :material-book-open-variant: **[User guide](user-guide.md)**

    How to use every feature, with screenshots.

-   :material-image-multiple: **[Examples](examples/README.md)**

    The standalone runtime, live — each feature on real images, rendered in the browser.

-   :material-cog-outline: **[Development docs](development/README.md)**

    Requirements, architecture, the implementation plan, tests, and the open-items + lessons backlog.

-   :material-github: **[Source on GitHub](https://github.com/Britz/obsidian-live-image-editor)**

    Issues, releases and the plugin code.

</div>

## What it does

- **Rotate & flip** — quarter-turns and free rotation, horizontal / vertical flip.
- **Crop** — an in-place editor: pan, zoom, rotate, aspect presets.
- **Resize** — width drag plus icon / small / medium / large / original presets.
- **Filters** — brightness, contrast, saturation, hue, blur, grayscale, sepia and named presets.
- **Layout** — align left / right / center with text wrap around floats, inline icons.
- **Captions & classes** — alt-text captions and reusable decoration classes (rounded, shadow,
  border, circle) plus your own vault snippets.

It follows Obsidian's locale and its central *Use \[\[Wikilinks\]\]* setting; it adds no language
or link-format setting of its own.
