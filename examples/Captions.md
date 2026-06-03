# Captions — test & demo page

Captions render the image's **alt text** as a line **below the image**, with Markdown
support (italic, bold, links, …). They are **off by default** — enable them first:

> **Settings → Live Image Editor → "Show image captions"** (toggle on).

Each caption must be **centered** under its image and **never wider than the image**
(a long caption wraps within the image width, it does not overflow). **Should** = what a
correct render shows.

## Plain caption

**Should:** the text *A calm landscape at dusk* appears centered just below the image.

![A calm landscape at dusk](images/sample-landscape.png){style="width: 360px;"}

## Markdown in the caption

**Should:** the caption renders formatting — **bold**, *italic* and a `code` span — not
the raw asterisks/backticks.

![A **bold** word, an *italic* word and a `code` word](images/sample-square.png){style="width: 240px;"}

## Long caption wraps within the image width

**Should:** the caption is **no wider than the image** (240px); the long text wraps onto
several centered lines under it, never spilling out to the side.

![Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua](images/sample-square.png){style="width: 240px;"}

## Caption on a rotated image

**Should:** the caption sits under the rotated image, centered on the **rotated bounding
box** (its visible width), not the pre-rotation width.

![Rotated 90° clockwise](images/sample-landscape.png){.lie-img style="transform: rotate(90deg); width: 300px"}

## Caption on a cropped image

**Should:** the caption is centered under the **cropped** image and matches the cut width.

![A square crop](images/sample-square.png){.lie-img style="width: 320px; height: 320px; transform: translate(-50%, -50%) scale(2)"}

## Caption with a filter

**Should:** grayscale image, caption unaffected (captions are document text, not pixels).

![Black and white](images/sample-landscape.png){.lie-img style="filter: grayscale(1); width: 320px"}

## No alt text → no caption

**Should:** no caption line at all (there is nothing to show).

![](images/sample-portrait.png){style="width: 160px;"}

## Wikilink caption

**Should:** the wikilink **display text** becomes the caption (*A portrait*); a bare
`|size` would not.

![[images/sample-portrait.png|A portrait]]{.lie-img style="width: 160px"}
