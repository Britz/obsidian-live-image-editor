// Pure geometry (AB5) — the single source consumed by the render core (to derive the
// box's aspect-ratio + the inner image's box-relative size) and by the canvas export.
// No DOM, so it's unit-testable (AD7/Lesson 6). Everything is derived from the image's
// INTRINSIC ratio (a stable property of the file) plus the transform — never measured
// from the rendered, column-dependent box, so there is no measure-then-resize loop
// (AD6, the root of the historical rotated-box drift).

// Quarter-turn index 0..3 for a rotation in degrees (any multiple of 90; rounds).
function quarter(deg: number): number {
  return (((Math.round(deg / 90) % 4) + 4) % 4);
}

/**
 * The box's `aspect-ratio` (width / height) for a quarter-turn of an image whose
 * intrinsic ratio is `r` (= naturalWidth / naturalHeight). 0°/180° keep `r`; 90°/270°
 * swap it (the rotated bounding box). Applied to the DOM box as an overridable default
 * (AD6) — so changing the angle reflows the box with no render-time measurement.
 */
export function boxAspectRatio(r: number, deg: number): number {
  if (!isFinite(r) || r <= 0) return 1;
  const q = quarter(deg);
  return q === 1 || q === 3 ? 1 / r : r;
}

/**
 * The inner image's size as a PERCENT of the box, for a quarter-turn (box → image,
 * AD3). 0°/180° → the image fills the box (100/100). 90°/270° → the image keeps its
 * own dimensions inside the swapped box, so its width is `r·100%` of the box width and
 * its height `(1/r)·100%` of the box height; after the centered `rotate()` it fills the
 * box exactly. Box-relative, so it rescales with the column for free.
 */
export function innerImageSize(r: number, deg: number): { w: number; h: number } {
  if (!isFinite(r) || r <= 0) return { w: 100, h: 100 };
  const q = quarter(deg);
  return q === 1 || q === 3 ? { w: r * 100, h: (1 / r) * 100 } : { w: 100, h: 100 };
}

/**
 * The axis-aligned bounding box of an image of `w`×`h` rotated by `deg` (any angle).
 * Used by the export to size the output canvas at the original resolution (F13).
 */
export function rotatedAabb(w: number, h: number, deg: number): { w: number; h: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    w: Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)),
    h: Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)),
  };
}

/**
 * The default box width (px) for an image with NO explicit width — the native cap. It is the
 * ORIGINAL intrinsic dimension on the ROTATION-CORRECT axis: a 0°/180° box caps on the original
 * WIDTH, a 90°/270° box on the original HEIGHT (the rotated bounding box). The `max-width:100%`
 * rule then shrinks it to the column. This is the SINGLE no-explicit-width sizing decision shared
 * by both the non-crop AND the cropped path (a cropped image whose width was removed must fall
 * back to native sizing exactly like any non-cropped image, never an empty/0-width box — Bug 78).
 * Pure (Lesson 6); `rotatedAabb.w` reduces to the swapped intrinsic dimension for a quarter-turn.
 */
export function nativeBoxWidth(nw: number, nh: number, deg: number): number {
  return Math.round(rotatedAabb(nw, nh, deg).w);
}

/**
 * The footprint box (px) for an EXPLICITLY-sized NON-crop image at angle `deg` (Bug 90). The stored
 * width/height are the image's BASE (unrotated) footprint, so a quarter-turn must SWAP them — a
 * 400×200 image rotated 90° occupies 200×400 — mirroring the crop path's `rotatedAabb` sizing
 * (`rotatedAabb` reduces to a clean swap at a quarter-turn, and is the true AABB at a free angle).
 * Width-only / height-only derive the missing base dimension from the intrinsic ratio
 * (`naturalRatio` = nw/nh) and return only that axis — the other follows the swapped aspect-ratio.
 * With no natural ratio available (width-only/height-only) the value passes through unrotated. Pure
 * (Lesson 6) — the single source the render core consumes for the rotated non-crop footprint.
 */
export function rotatedFootprint(opts: {
  widthPx: number | null;
  heightPx: number | null;
  naturalRatio: number | null;
  deg: number;
}): { width?: number; height?: number } {
  const { widthPx, heightPx, naturalRatio, deg } = opts;
  const ratioOk = naturalRatio != null && isFinite(naturalRatio) && naturalRatio > 0;
  if (widthPx != null && heightPx != null) {
    const a = rotatedAabb(widthPx, heightPx, deg);
    return { width: Math.round(a.w), height: Math.round(a.h) };
  }
  if (widthPx != null) {
    if (!ratioOk) return { width: Math.round(widthPx) };
    return { width: Math.round(rotatedAabb(widthPx, widthPx / naturalRatio, deg).w) };
  }
  if (heightPx != null) {
    if (!ratioOk) return { height: Math.round(heightPx) };
    return { height: Math.round(rotatedAabb(heightPx * naturalRatio, heightPx, deg).h) };
  }
  return {};
}

/**
 * A SYNCHRONOUS estimate of a block image's rendered height for the CM6 block widget's
 * `estimatedHeight` (so CodeMirror doesn't model an off-screen image line as one ~14px
 * text line and lurch the scroll when it's measured). No access to the natural size (an
 * off-screen image isn't loaded), so it's rough on purpose — the real size still lands
 * declaratively once the box has its aspect-ratio. Pure (Lesson 6).
 *
 * Prefers an explicit px height, then a px width × the box aspect-ratio (or a typical
 * landscape ratio), else a sensible constant for a column-width image.
 */
export function estimatedBlockHeight(opts: {
  widthPx?: number | null;
  heightPx?: number | null;
  aspectRatio?: number | null;
}): number {
  if (opts.heightPx && opts.heightPx > 0) return Math.round(opts.heightPx);
  const ar = opts.aspectRatio && opts.aspectRatio > 0 ? opts.aspectRatio : 1 / 0.7;
  if (opts.widthPx && opts.widthPx > 0) return Math.round(opts.widthPx / ar);
  return 480;
}

// CodeMirror 6's above-viewport render margin (`VP.MaxCoverMargin`, an inlined const in
// @codemirror/view — not configurable). A FLOAT taller than this derenders prematurely when
// its anchor line scrolls out of the render window (the wrap dissolves; no desync, harmless),
// so the rework caps floats at it: above the threshold a float falls back to a non-floated
// block (the tall-float cap — governs Live Preview AND Reading view identically).
export const TALL_FLOAT_THRESHOLD_PX = 250;

/**
 * Whether an image's estimated rendered height exceeds the tall-float threshold — i.e. a
 * float at this size would derender on scroll, so it should fall back to a non-floated block.
 * Uses the synchronous (declarative) estimate, so the decision is the SAME in both views with
 * no DOM measurement (AD6). Pure (Lesson 6).
 */
export function isTallFloat(opts: {
  widthPx?: number | null;
  heightPx?: number | null;
  aspectRatio?: number | null;
}): boolean {
  return estimatedBlockHeight(opts) > TALL_FLOAT_THRESHOLD_PX;
}
