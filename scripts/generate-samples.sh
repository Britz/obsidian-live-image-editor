#!/usr/bin/env bash
# Regenerate the synthetic sample images used by the vault-image-toolbar demo pages and the docs screenshots.
# Synthetic (ImageMagick) — no third-party content, safe to commit. Requires `magick`.
set -euo pipefail
cd "$(dirname "$0")/../vault-image-toolbar/images"

# Explicit font — minimal containers have no default ImageMagick font configured.
FONT="${LIE_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}"

# Corner labels A/B/C/D + a big TOP marker make rotate/flip unambiguous in shots.
corners() {
  echo "-fill rgba(255,255,255,0.85) -pointsize 30 \
    -gravity NorthWest -annotate +20+18 A -gravity NorthEast -annotate +20+18 B \
    -gravity SouthWest -annotate +20+18 C -gravity SouthEast -annotate +20+18 D"
}

# 1. Landscape (3:2) — sky gradient, sun top-right, mountain silhouette. Colourful,
#    so brightness/contrast/saturation/sepia filters read clearly.
magick -font "$FONT" -size 1200x800 gradient:'#0d1b3e-#3a6ea5' \
  \( -size 1200x800 xc:none -fill '#ffe08a' -draw "circle 1000,170 1000,90" \) -composite \
  -fill '#16324f' -draw "polygon 0,800 0,560 250,420 480,600 720,400 980,580 1200,470 1200,800" \
  -fill '#0e2233' -draw "polygon 0,800 0,660 300,540 600,690 900,560 1200,650 1200,800" \
  -fill white -pointsize 46 -gravity North -annotate +0+28 'TOP' \
  $(corners) \
  sample-landscape.png

# 2. Portrait (2:3) — warm vertical gradient, big TOP marker. Different aspect ratio
#    for resize / alignment / float demos.
magick -font "$FONT" -size 800x1200 gradient:'#ff7e5f-#feb47b' \
  -fill 'rgba(0,0,0,0.5)' -draw "polygon 400,120 520,300 440,300 440,520 360,520 360,300 280,300" \
  -fill white -pointsize 54 -gravity Center -annotate +0+120 'PORTRAIT' \
  -fill white -pointsize 40 -gravity North -annotate +0+28 'TOP' \
  $(corners) \
  sample-portrait.png

# 3. Square (1:1) — concentric rings on a cyan/blue radial gradient. Good for the
#    circle / rounded classes and 1:1 crop.
magick -font "$FONT" -size 1000x1000 radial-gradient:'#36d1dc-#5b86e5' \
  -fill none -stroke 'rgba(255,255,255,0.45)' -strokewidth 6 \
  -draw "circle 500,500 500,180" -draw "circle 500,500 500,80" \
  -fill white -stroke none -pointsize 64 -gravity Center -annotate +0+0 'SQUARE' \
  -fill white -pointsize 40 -gravity North -annotate +0+28 'TOP' \
  $(corners) \
  sample-square.png

echo "Wrote: $(ls sample-*.png)"
