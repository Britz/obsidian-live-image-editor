// Pure quantization + serialization for the crop interaction (F12). The cut must
// never fall mid-pixel or mid-angle in the FIRST place — so the image position snaps
// to whole pixels and the rotation to 0.1° steps CONTINUOUSLY while the user drags,
// not merely by rounding the committed output. Kept DOM-free so it's unit testable
// (T-L6). The committed result is the img's NATIVE transform (translate% + rotate +
// scale, box-relative → responsive, AD2) plus the cut-frame box width/height.

export interface Point {
  x: number;
  y: number;
}

export interface CropResult {
  // The img's native transform (routed verbatim to the img). translate is in %
  // (relative to the img's own box-width baseline) so it rescales with the column.
  transform: string;
  // The cut frame = the box size.
  width: string;
  height: string;
}

/** Snap a live drag position to whole pixels. */
export function snapTranslate(x: number, y: number): Point {
  return { x: Math.round(x), y: Math.round(y) };
}

/** Snap a live rotation to 0.1° steps. */
export function snapAngle(deg: number): number {
  return Math.round(deg * 10) / 10;
}

/** Snap a live scale to 1/1000 so the committed value is stable. */
export function snapScale(s: number): number {
  return Math.round(s * 1000) / 1000;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Build the committed native-transform crop from the (already-snapped) editor state.
 *
 * The editor works in DISPLAY px over the image's on-screen rect; the render shows the
 * original at `width:100%` of the box (a box-width baseline). `baselineWidth` is the
 * editor's source-image display width (its scale-1 size) and `frame.w/h` the cut frame
 * in the same display px; `intrinsicRatio` = naturalWidth/naturalHeight. The result's
 * `scale` is re-expressed against the box-width baseline so editor and render agree.
 */
export function toCropResult(
  translate: Point,
  frame: { w: number; h: number },
  rotate: number,
  scale: number,
  baselineWidth: number,
  intrinsicRatio: number
): CropResult {
  const fw = Math.max(1, Math.round(frame.w));
  const fh = Math.max(1, Math.round(frame.h));
  const r = intrinsicRatio > 0 ? intrinsicRatio : 1;
  // Render img display height at the box-width baseline.
  const imgH = fw / r;
  const txPct = round1((translate.x / fw) * 100);
  const tyPct = round1((translate.y / imgH) * 100);
  // Re-express the editor scale (relative to baselineWidth) against the box width.
  const s = snapScale((scale * (baselineWidth || fw)) / fw);
  const transform = `translate(${txPct}%, ${tyPct}%) rotate(${snapAngle(rotate)}deg) scale(${s})`;
  return { transform, width: `${fw}px`, height: `${fh}px` };
}
