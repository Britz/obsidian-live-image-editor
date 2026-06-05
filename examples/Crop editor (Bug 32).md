# Crop editor — Bug 32 fixture

Permanent fixture for the in-place crop editor rework (Bug 32). Use in **Live Preview** and in
**Reading view**. The structural checks are automated in `scripts/verify-crop.mjs`; the drag
feel (pan / corner / edge / rotate / pinch sensitivity) is the manual checklist.

## 1 — Plain image (open crop on a non-crop)

Crop should open in place with **no jump/reflow**; rotate pivots the **centre**; the white handle
frame sits on the **image** (corner + edge + rotate handles); the box stays fixed; leaving the
panel persists once (Cmd-Z undoes the whole session in one step).

![](images/sample-landscape.png){rotate=90 transform="translate(-1.4%, -3.3%) rotate(-88deg) scale(1.325)" aspect-ratio=363/363 width=363}

## 2 — Already cropped (re-open a crop)

Re-opening should show the SAME cut (preview == committed); a width resize must PRESERVE the crop.

![](images/sample-landscape.png){transform="translate(-12%, -6%) scale(1.4)" aspect-ratio=4/3 width=260}

## 3 — Rotated + cropped (orientation is decoupled)

The frame orientation (`rotate=90`) is left alone by the editor; only the content placement is
edited, pivoting about the cut centre.

![](images/sample-portrait.png){rotate=90 transform="translate(0%, 0%) scale(1.2)" aspect-ratio=3/4 width=200}

## 4 — Duplicate file (write-path guard)

Cropping the SECOND copy must write the second line, not the first.

![](images/sample-square.png)

![](images/sample-square.png)
