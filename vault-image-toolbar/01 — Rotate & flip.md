# Rotate & flip

Rotate in quarter turns from the toolbar (↺ / ↻), or freely while cropping ([[02 — Crop]]). Flip
horizontally or vertically. The footprint box always hugs the rotated image — no empty band, never
wider than the text column.

## Original (landscape, unchanged)

A top-left, B top-right, C/D bottom, **TOP** at the top.

![](images/sample-landscape.png)

## Rotate 90° clockwise

**TOP** runs down the right edge; the box is now portrait-shaped and hugs the image.

![](images/sample-landscape.png){rotate=270 width=300}

## Rotate 180°

Upside down — **TOP** at the bottom, A bottom-right.

![](images/sample-landscape.png){rotate=180 width=420}

## Rotate 270°

**TOP** runs down the left edge.

![](images/sample-landscape.png){rotate=270 width=300}

## Flip horizontal (portrait)

**TOP** stays up, but left/right swap — A moves to the top-**right**, the text reads mirrored.

![](images/sample-portrait.png){flip=horizontal width=200}

## Flip vertical (portrait)

Top/bottom swap — **TOP** at the bottom, the arrow points down.

![](images/sample-portrait.png){flip=vertical width=200}

## Rotate + flip together

Orientation composes: rotated 90° **and** flipped horizontally.

![](images/sample-portrait.png){rotate=90 flip=horizontal width=300}
