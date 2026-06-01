import { CropData } from "./transforms";

// Pure quantization for the crop interaction (F7). The cut must never fall
// mid-pixel or mid-angle in the FIRST place — so the image position snaps to
// whole pixels and the rotation to 0.1° steps CONTINUOUSLY while the user drags,
// not merely by rounding the committed output. Kept DOM-free so it's unit
// testable (T-L6).

export interface Point {
  x: number;
  y: number;
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

/**
 * Build the committed CropData from the (already-snapped) interaction state.
 * x/y are the image's offset relative to the original, derived from the negated
 * translate (translating the image right == cutting from further left).
 */
export function toCropData(
  translate: Point,
  frame: { w: number; h: number },
  rotate: number,
  scale: number
): CropData {
  return {
    x: Math.round(-translate.x),
    y: Math.round(-translate.y),
    w: Math.round(frame.w),
    h: Math.round(frame.h),
    rotate: snapAngle(rotate),
    scale: snapScale(scale),
  };
}
