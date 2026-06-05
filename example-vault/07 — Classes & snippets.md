# Classes & snippets

The toolbar's **Add class** button offers any image-targeting CSS class it finds in your vault's
enabled CSS snippets, each individually toggleable. The plugin also **ships example decoration
snippets** — `rounded`, `shadow`, `bordered`, `circle` — that surface through the same mechanism.

> Install them once: **Settings → Live Image Editor → Install example snippets** (already installed
> and enabled in this vault). They are editable; a **Reset** restores the shipped version.

A class is stored as a plain `.class` token in the block (e.g. `{.rounded width=360}`), so it stays
a normal CSS class — portable and inert without the plugin.

## Rounded corners — `.rounded`

![](images/sample-landscape.png){.rounded width=360}

## Soft drop shadow — `.shadow`

![](images/sample-landscape.png){.shadow width=360}

## Rounded + shadow together

![](images/sample-landscape.png){.rounded .shadow width=360}

## Border — `.bordered`

![](images/sample-portrait.png){.bordered width=200}

## Circle mask — `.circle`

The square sample clipped to a circle.

![](images/sample-square.png){.circle width=200}

## A class combined with a transform

Rounded corners on a 90°-rotated, sepia-toned image.

![](images/sample-landscape.png){.rounded rotate=90 filter="sepia(0.6)" width=240}
