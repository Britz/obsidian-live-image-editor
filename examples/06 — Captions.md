# Captions

A caption renders the image's **alt text** as a line **below the image**, as Markdown (bold,
italic, links, code). It is centered, muted, and **never wider than the image** — a long caption
wraps within the image width. The alt text stays the single source; there is no separate caption
store.

> Enable first: **Settings → Live Image Editor → Show image captions** (off by default; on in this
> vault).

## Plain caption

The text *A calm landscape at dusk* appears centered just below the image.

![A calm landscape at dusk](images/sample-landscape.png){width=360}

## Markdown in the caption

The caption renders **bold**, *italic* and a `code` span — not the raw markup.

![A **bold** word, an *italic* word and a `code` word](images/sample-square.png){width=240}

## Long caption wraps within the image width

The caption is no wider than the image (240 px); the long text wraps onto centered lines.

![Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua](images/sample-square.png){width=240}

## Caption on a rotated image

Centered on the rotated bounding box (its visible width), not the pre-rotation width.

![Rotated 90° clockwise](images/sample-landscape.png){rotate=90 width=300}

## Caption with a filter

Grayscale image; the caption is document text, unaffected by the pixel filter.

![Black and white](images/sample-landscape.png){filter="grayscale(1)" width=320}

## Wikilink caption

The wikilink **display text** becomes the caption (*A portrait*); a bare `|size` would not.

![[images/sample-portrait.png|A portrait]]{width=160}

## No alt text → no caption

No caption line at all (there is nothing to show).

![](images/sample-portrait.png){width=160}
