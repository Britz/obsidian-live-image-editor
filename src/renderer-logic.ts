/**
 * Pure geometry for the quarter-turn reflow (no DOM, so it's unit-testable).
 * Given the displayed image size and the rotation, compute the axis-aligned
 * bounding box of the rotated image and the scale applied to it.
 *
 * The box is sized to `targetWidth` (the user's resized width, e.g. from the drag
 * handle) when given, else to its natural extent — in both cases capped at `avail`
 * so it never exceeds the column (Obsidian can't scroll horizontally). `scale` is
 * relative to the unscaled extent, so callers scale the image by the same factor.
 */
/**
 * The display size of a crop box and the scale applied to the cut. Pure (no DOM) so
 * it's unit-testable (T-L6).
 *
 * The box must match the SCALED cut, not the raw cut size: when only a `width` is
 * given, the height is derived from the cut's aspect ratio (and vice-versa) so the
 * box doesn't stay `crop.h` tall while the content scales down with the width —
 * which left an empty band below the crop and pushed a caption far beneath it (a
 * crop flavour of Bug 2). With both width and height the box honours them (letterbox
 * via `scale = min` if their aspect differs); with neither it's the cut's own size.
 */
export function cropBoxSize(
  crop: { w: number; h: number },
  width?: number,
  height?: number
): { w: number; h: number; scale: number } {
  const w = width ?? (height != null && crop.h ? (height * crop.w) / crop.h : crop.w);
  const h = height ?? (width != null && crop.w ? (width * crop.h) / crop.w : crop.h);
  const scale = Math.min(crop.w ? w / crop.w : 1, crop.h ? h / crop.h : 1);
  return { w, h, scale };
}

/**
 * A SYNCHRONOUS estimate of a block image's rendered height, with NO access to the
 * image's natural size (an off-screen image isn't loaded yet). Used for the CM6 block
 * widget's `estimatedHeight` (so CodeMirror doesn't model every off-screen image line
 * as one text line ~14px tall and then lurch the scroll when it's measured) and to
 * reserve the box height up front (so it never grows from 0). Pure (T-L6).
 *
 * A crop is exact (its size is in the {…} block, no natural size needed). Otherwise we
 * only know the displayed WIDTH (or nothing); the aspect is unknown, so a height-set
 * image uses its height, a width-set image assumes a typical landscape ratio, and an
 * unsized image (fills the column) gets a sensible constant. Rough on purpose — it
 * only needs to be in the ballpark to fix the scroll model; the real size still lands.
 */
export function estimatedBlockHeight(opts: { crop?: { w: number; h: number }; width?: number; height?: number }): number {
  if (opts.crop) return Math.round(cropBoxSize(opts.crop, opts.width, opts.height).h);
  if (opts.height) return opts.height;
  if (opts.width) return Math.round(opts.width * 0.7);
  return 480;
}

export function rotatedBox(
  dispW: number,
  dispH: number,
  deg: number,
  avail: number,
  targetWidth?: number
): { bw: number; bh: number; scale: number } {
  const rad = (deg * Math.PI) / 180;
  const bw0 = Math.abs(dispW * Math.cos(rad)) + Math.abs(dispH * Math.sin(rad));
  const bh0 = Math.abs(dispW * Math.sin(rad)) + Math.abs(dispH * Math.cos(rad));
  const desired = targetWidth != null ? Math.min(targetWidth, avail) : Math.min(bw0, avail);
  const scale = bw0 > 0 ? desired / bw0 : 1;
  return { bw: bw0 * scale, bh: bh0 * scale, scale };
}
