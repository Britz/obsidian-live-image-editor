# Crop

The crop button opens the editor **in place** — no jump or reflow. **Drag** to pan, **scroll /
pinch** to zoom, the **rotate knob** for free rotation, and the **aspect presets** (1:1, 4:3, …) to
reshape the cut. Outside the cut is dimmed, inside is full. Leaving the panel **persists once**
(one Cmd/Ctrl-Z undoes the whole crop); **Reset** restores the full image, **✗ / Esc** discards.

The crop is stored portably as a placement `transform=` on the image plus the cut shape
`aspect-ratio=` — never a fixed pixel height, so it stays sharp and rescales with the column.

## A plain image — open crop on it

Open the crop editor here and try pan / zoom / rotate / the aspect presets.

![](images/sample-landscape.png){width=420}

## An existing crop (re-open it)

A centred square cut of the landscape. Re-opening shows the **same** cut; a width resize keeps it.

![](images/sample-landscape.png){transform="translate(-12%, -6%) scale(1.4)" aspect-ratio=4/3 width=300}

## A centred square crop of the square sample

The middle of the square (outer edges cut away on all sides), shown at 260 px.

![](images/sample-square.png){transform="translate(-50%, -50%) scale(2)" aspect-ratio=1/1 width=260}

## Rotated *and* cropped (orientation is decoupled)

The frame orientation (`rotate=90`) and the content placement are independent — re-orienting never
disturbs the cut.

![](images/sample-portrait.png){rotate=90 transform="translate(0%, 0%) scale(1.2)" aspect-ratio=3/4 width=240}

## Duplicate file (the right occurrence is edited)

The same file embedded twice. Cropping (or any edit on) the **second** copy writes the **second**
line, never the first — position-exact resolution, in both Live Preview and Reading view.

![](images/sample-square.png){width=200}

![](images/sample-square.png){width=200}
