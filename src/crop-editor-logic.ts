// Pure quantization + serialization for the crop interaction (F12). The cut must
// never fall mid-pixel or mid-angle in the FIRST place — so the image position snaps
// to whole pixels and the rotation to 0.1° steps CONTINUOUSLY while the user drags,
// not merely by rounding the committed output. Kept DOM-free so it's unit testable
// (Lesson 6). The committed result is the img's NATIVE transform (translate% + rotate +
// scale, box-relative → responsive, AD2) plus the cut-frame box width/height.

export interface Point {
  x: number;
  y: number;
}

export interface CropResult {
  // The img's crop PLACEMENT transform (routed verbatim to the img). translate is in %
  // (relative to the img's own cut-frame-width baseline) so it rescales with the column.
  transform: string;
  // The cut-frame WIDTH (the footprint base width).
  width: string;
  // The cut-frame SHAPE as an aspect-ratio, stored ONLY when it differs from the original
  // image ratio (AD6 — store only non-derivable intent; a crop that keeps the original aspect
  // stores nothing and the footprint is derived). NOT a fixed px height (that would distort).
  aspectRatio?: string;
}

/** The editor's working state in PLACEMENT space (display px over the cut frame + per-axis scale). */
export interface Placement {
  tx: number;
  ty: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Parse a stored crop placement transform back into the editor's px-state — the INVERSE of
 * `toCropResult` (translate% → px over the cut frame, content-rotate, per-axis scale). Pure so the
 * round-trip is unit-testable: `parsePlacement(toCropResult(state).transform, fw, r)` reproduces the
 * state, i.e. the editor reads back EXACTLY what it commits — no top-left/centre drift (Bug 51 A).
 */
export function parsePlacement(s: string | undefined, frameW: number, intrinsicRatio: number): Placement {
  const out: Placement = { tx: 0, ty: 0, rotate: 0, scaleX: 1, scaleY: 1 };
  if (!s) return out;
  const imgH = frameW / (intrinsicRatio > 0 ? intrinsicRatio : 1);
  const re = /([a-zA-Z][\w-]*)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const args = (m[2] ?? "").split(",").map((a) => a.trim());
    const n0 = parseFloat(args[0] ?? "");
    if (m[1] === "translate") {
      out.tx = ((n0 || 0) / 100) * frameW;
      out.ty = ((parseFloat(args[1] ?? "") || 0) / 100) * imgH;
    } else if (m[1] === "rotate") out.rotate = n0 || 0;
    else if (m[1] === "scale") { out.scaleX = n0 || 1; out.scaleY = (parseFloat(args[1] ?? "") || n0) || 1; }
    else if (m[1] === "scaleX") out.scaleX = n0 || 1;
    else if (m[1] === "scaleY") out.scaleY = n0 || 1;
  }
  return out;
}

/** Snap a live drag position to whole pixels. */
export function snapTranslate(x: number, y: number): Point {
  return { x: Math.round(x), y: Math.round(y) };
}

/** Snap a live rotation to 0.1° steps. */
export function snapAngle(deg: number): number {
  return Math.round(deg * 10) / 10;
}

// The native trackpad rotate-gesture sign: Electron's `rotate-gesture` delta is CCW-positive
// (macOS NSEvent.rotation), while CSS `rotate()` is CW-positive (screen Y points down). Negating
// makes a clockwise two-finger turn rotate the content clockwise — the natural mapping. Flip this
// single sign if the feel ever reads reversed.
const ROTATE_GESTURE_SIGN = -1;

/**
 * Fold one Electron `rotate-gesture` delta (degrees since the last emission, macOS only) into the
 * current content rotation, snapped to 0.1° LIVE — exactly like the rotate handle, so the gesture
 * and the handle accumulate and commit identical angles. Pure (DOM-free) so it's unit-testable.
 */
export function applyRotateGesture(current: number, deltaDeg: number): number {
  return snapAngle(current + ROTATE_GESTURE_SIGN * deltaDeg);
}

/** Snap a live scale to 1/1000 so the committed value is stable. */
export function snapScale(s: number): number {
  return Math.round(s * 1000) / 1000;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

// The editor scale: a single uniform factor (corner handles / wheel / pinch), or a per-axis
// pair (edge handles, single-axis — D8). A number is shorthand for { x: n, y: n }.
export type CropScale = number | { x: number; y: number };

/**
 * Build the committed native-transform crop from the (already-snapped) editor state — the SINGLE
 * geometry source the in-place editor ALSO uses for its live preview (so preview == committed by
 * construction, the Bug-43 A/B/C fix). The placement is the verbatim `<img>` transform the render
 * core consumes (AD2), pivoting about the image CENTRE (render-core sets `transform-origin:center`).
 *
 * The editor works in DISPLAY px over the cut-frame's on-screen rect; the render shows the original
 * at `width:100%` of the cut frame (a cut-frame-width baseline). `baselineWidth` is the editor's
 * source-image display width (its scale-1 size — in-place this equals `frame.w`) and `frame.w/h` the
 * cut frame in the same display px; `intrinsicRatio` = naturalWidth/naturalHeight. The `scale` is
 * re-expressed against the cut-frame width so editor and render agree. translate is in % of the
 * cut-frame width (x) and the cut-frame-width display height (y), so the crop rescales with the
 * column AND survives a footprint-width resize without re-anchoring (the Bug-43 G fix).
 */
export function toCropResult(
  translate: Point,
  frame: { w: number; h: number },
  rotate: number,
  scale: CropScale,
  baselineWidth: number,
  intrinsicRatio: number
): CropResult {
  const fw = Math.max(1, Math.round(frame.w));
  const fh = Math.max(1, Math.round(frame.h));
  const r = intrinsicRatio > 0 ? intrinsicRatio : 1;
  // Render img display height at the cut-frame-width baseline.
  const imgH = fw / r;
  const txPct = round1((translate.x / fw) * 100);
  const tyPct = round1((translate.y / imgH) * 100);
  const transform = `translate(${txPct}%, ${tyPct}%) rotate(${snapAngle(rotate)}deg) ${scaleFn(scale, baselineWidth || fw, fw)}`;
  // Store the cut-frame shape ONLY when it differs from the original ratio (AD6); otherwise the
  // footprint is derived from the original ratio and nothing is stored.
  const cutAspect = fw / fh;
  const aspectRatio = Math.abs(cutAspect - r) / r > 0.01 ? `${fw}/${fh}` : undefined;
  return { transform, width: `${fw}px`, aspectRatio };
}

// The `scale(...)` function for the placement: re-express the editor scale (relative to
// `baselineWidth`) against the cut-frame width, then emit `scale(s)` for a uniform factor or
// `scale(sx, sy)` for a single-axis (edge-handle) crop. Both forms keep `isCrop` true and replay
// identically in the render core and the canvas exporter (which both read translate/rotate/scale).
function scaleFn(scale: CropScale, baselineWidth: number, fw: number): string {
  const reExpress = (s: number): number => snapScale((s * baselineWidth) / fw);
  const sx = reExpress(typeof scale === "number" ? scale : scale.x);
  const sy = reExpress(typeof scale === "number" ? scale : scale.y);
  return Math.abs(sx - sy) < 1e-9 ? `scale(${sx})` : `scale(${sx}, ${sy})`;
}
