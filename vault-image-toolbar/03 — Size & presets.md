# Size & presets

Resize with Obsidian's **native handle** (drag the corner) or the toolbar's **size** button, which
opens a panel with one-tap presets and side-by-side width / height fields. The width is stored as a
plain `width=N` (faithful in any renderer); aspect ratio is preserved unless you set both width and
height.

The presets are **icon · small · medium · large · original** (small/medium/large widths are
configurable in **Settings → Live Image Editor**).

## Original (natural width, capped to the column)

![](images/sample-landscape.png)

## Small / medium / large (this vault: 200 / 400 / 800 px)

Small — 200 px:

![](images/sample-landscape.png){width=200}

Medium — 400 px:

![](images/sample-landscape.png){width=400}

## A custom width

320 px wide, aspect ratio kept.

![](images/sample-landscape.png){width=320}

## Icon size + inline layout

Size and layout are **independent** now: the **icon** size preset just sets a line-height height, and
the **inline** layout state (Layout group) makes the image flow *within* a line. Combine them for an
in-text icon ![](images/sample-square.png){.lie-inline height=1.4em} sitting in the sentence (F17), and
the words continue normally afterwards.

## Original (clears the explicit width)

The **original** preset removes the width, returning to the natural size (column-capped).

![](images/sample-portrait.png)
