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
