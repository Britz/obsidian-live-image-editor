# Captions

A caption renders the image's **alt text** as a line **below the image**, parsed as Markdown (so bold, italic, links and code all work).
It is centered, muted, and **never wider than the image** — a long caption wraps onto several centered lines within the image width instead of stretching the layout.
The alt text stays the single source of truth;
there is no separate caption store to keep in sync.

> Enable first: **Settings → Live Image Editor → Show image captions** (off by default; on in this vault).

## Plain caption

The simplest case — plain alt text becomes the caption.
The text *A calm landscape at dusk* appears centered just below the image, in the muted caption style.

![A calm landscape at dusk](images/sample-landscape.png){width=360}

## Markdown in the caption

The caption is rendered, not shown raw:
this alt text mixes **bold**, *italic* and a `code` span, and each should appear formatted below the image rather than as literal `**` / `*` / backtick markup.

![A **bold** word, an *italic* word and a `code` word](images/sample-square.png){width=240}

## Long caption wraps within the image width

This is the case that needs a lot of text — a short caption would never reveal the wrap.
The caption below is deliberately long so you can confirm it stays no wider than the 240px image and breaks onto **centered** lines underneath it, rather than widening the image's column.
The opening sentence says what to check;
the trailing *italic* run is just filler to push the caption past one line.

![This deliberately long caption proves the caption never grows wider than its 240px image — it wraps onto centered lines below the picture instead of stretching the layout — and, to push it past a single line, some filler: *lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua*](images/sample-square.png){width=240}

## Caption on a rotated image

The caption centers on the image's **visible** footprint.
Here the image is rotated 90°, so the caption should sit centered under the rotated bounding box (its post-rotation width), not under the wider pre-rotation width.

![Rotated 90° clockwise](images/sample-landscape.png){rotate=90 width=300}

## Caption with a filter

Pixel filters touch only the image, never the document text.
The image is rendered grayscale, but the caption is ordinary note text and stays in its normal color, unaffected by the `grayscale(1)` filter.

![Black and white](images/sample-landscape.png){filter="grayscale(1)" width=320}

## Wikilink caption

For a `![](wikilink)` embed the **display text** after the `|` becomes the caption (here *A portrait*).
A bare `|size` value such as `|160` is treated as a size, not a caption, so it would produce no text.

![](sample-portrait.png){width=160}

## No alt text → no caption

With empty alt text there is nothing to render, so the plugin draws **no** caption line at all — not an empty gap.
The image simply stands on its own.

![](images/sample-portrait.png){width=160}
