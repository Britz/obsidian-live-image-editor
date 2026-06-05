# Filters

The filter button opens a panel with a **live histogram** and sliders grouped by purpose —
brightness, contrast, saturation, hue, blur, grayscale, sepia — plus **named presets** (B&W, sepia,
vintage, warm, cool). Double-click a slider to reset it. Filters are non-destructive (a CSS
`filter`, stored as a `filter="…"` block) and exported into the pixels on **Export**.

## Original

![](images/sample-landscape.png){width=420}

## Grayscale

![](images/sample-landscape.png){filter="grayscale(1)" width=420}

## Sepia (the "sepia" preset)

![](images/sample-landscape.png){filter="sepia(0.8) contrast(1.05) brightness(1.05)" width=420}

## Brighter + more saturated

![](images/sample-landscape.png){filter="brightness(1.3) saturate(1.6)" width=420}

## Hue-rotated (the blue sky shifts)

![](images/sample-landscape.png){filter="hue-rotate(200deg) saturate(0.9)" width=420}

## Blur

![](images/sample-landscape.png){filter="blur(2px)" width=420}

## Filter + transform together

Grayscale on a 90°-rotated image — content filter and orientation are independent.

![](images/sample-landscape.png){rotate=90 filter="grayscale(1)" width=280}
