import { describe, it, expect } from "vitest";
import { snapTranslate, snapAngle, snapScale, toCropResult, parsePlacement, applyRotateGesture } from "../../src/crop-editor-logic";
import { isCrop } from "../../src/transforms";

describe("crop live snapping (F12 — quantize during the interaction)", () => {
  it("snaps drag position to whole pixels", () => {
    expect(snapTranslate(10.4, -3.6)).toEqual({ x: 10, y: -4 });
    expect(snapTranslate(0.5, 0.49)).toEqual({ x: 1, y: 0 });
  });
  it("snaps rotation to 0.1° steps", () => {
    expect(snapAngle(12.34)).toBe(12.3);
    expect(snapAngle(12.35)).toBeCloseTo(12.4, 5);
  });
  it("snaps scale to 1/1000", () => {
    expect(snapScale(1.23456)).toBe(1.235);
    expect(snapScale(0.9999)).toBe(1);
  });
});

describe("applyRotateGesture (macOS trackpad rotate-gesture → content rotation)", () => {
  // Native delta is CCW-positive; CSS rotate() is CW-positive — so a clockwise (negative) gesture
  // delta must INCREASE the content angle (clockwise on screen). The sign is negated.
  it("negates the native CCW-positive delta so a CW gesture rotates content CW", () => {
    expect(applyRotateGesture(0, -5)).toBe(5);   // CW gesture → +5° (CW on screen)
    expect(applyRotateGesture(0, 5)).toBe(-5);   // CCW gesture → -5°
  });
  it("accumulates deltas from the current angle and snaps to 0.1° like the handle", () => {
    expect(applyRotateGesture(10, -2)).toBe(12);
    expect(applyRotateGesture(12, -0.34)).toBeCloseTo(12.3, 5);   // snaps to 0.1°
    expect(applyRotateGesture(-3.1, 1)).toBeCloseTo(-4.1, 5);
  });
  it("is a no-op for a zero delta (the gesture's final emission)", () => {
    expect(applyRotateGesture(7.5, 0)).toBe(7.5);
  });
});

describe("toCropResult (editor state → placement transform + cut-frame width/aspect, AD2/AD6)", () => {
  it("emits translate% (cut-relative), rotate, scale + cut width; aspect ≠ original is stored", () => {
    // baseline = cut width = 200; frame 200×150 (4:3) ≠ original 2:1; r = 2 → img display height = 100.
    const r = toCropResult({ x: 50, y: 25 }, { w: 200, h: 150 }, 0, 1, 200, 2);
    expect(r.transform).toBe("translate(25%, 25%) rotate(0deg) scale(1)");
    expect(r.width).toBe("200px");
    expect(r.aspectRatio).toBe("200/150");
  });
  it("omits aspect-ratio when the cut keeps the original ratio (derived, AD6)", () => {
    // frame 200×200 (1:1) == original 1:1 → nothing stored.
    const r = toCropResult({ x: 0, y: 0 }, { w: 200, h: 200 }, 0, 1, 400, 1);
    expect(r.transform).toContain("scale(2)"); // editor scale re-expressed: 1·400/200 = 2
    expect(r.aspectRatio).toBeUndefined();
    expect(r.width).toBe("200px");
  });
  it("produces an integer-px cut width, a stored aspect-ratio and a quantized angle", () => {
    const r = toCropResult({ x: 0, y: 0 }, { w: 123.9, h: 45.1 }, 12.34, 1, 124, 1);
    expect(r.width).toBe("124px");
    expect(r.aspectRatio).toBe("124/45");
    expect(r.transform).toContain("rotate(12.3deg)");
  });

  // Edge handles (D8 single-axis): a per-axis scale serializes as scale(sx, sy) and STAYS a crop
  // (isCrop matches a `scale`), which the render core + the canvas exporter replay identically.
  it("serializes a single-axis (edge-handle) scale as scale(sx, sy) and stays a crop", () => {
    const r = toCropResult({ x: 0, y: 0 }, { w: 200, h: 150 }, 0, { x: 1.5, y: 1.2 }, 200, 2);
    expect(r.transform).toBe("translate(0%, 0%) rotate(0deg) scale(1.5, 1.2)");
    expect(isCrop({ classes: [], transform: r.transform })).toBe(true);
  });
  it("collapses an equal per-axis scale back to the uniform scale(s) form", () => {
    const r = toCropResult({ x: 0, y: 0 }, { w: 200, h: 200 }, 0, { x: 2, y: 2 }, 200, 1);
    expect(r.transform).toContain("scale(2)");
    expect(r.transform).not.toContain("scale(2, 2)");
  });
});

// The editor reads back EXACTLY what it commits (centre-origin, % baselines preserved) — so the
// live preview equals the committed render and a release never drifts (Bug 43 A). In-place the
// editor's scale-1 baseline IS the cut-frame width, so parse∘serialize is the identity.
describe("parsePlacement ∘ toCropResult round-trip (Bug 43 A — no centre/top-left drift)", () => {
  const frameW = 200, r = 2; // img display height at width:100% = 100
  const cases = [
    { tx: 50, ty: 25, rotate: 12.3, scaleX: 1.5, scaleY: 1.5 },
    { tx: -30, ty: 40, rotate: -8.7, scaleX: 0.8, scaleY: 0.8 },
    { tx: 0, ty: 0, rotate: 0, scaleX: 1.5, scaleY: 1.2 }, // edge-handle (single-axis)
  ];
  for (const c of cases) {
    it(`round-trips ${JSON.stringify(c)}`, () => {
      const tf = toCropResult(
        { x: c.tx, y: c.ty }, { w: frameW, h: 150 }, c.rotate, { x: c.scaleX, y: c.scaleY }, frameW, r
      ).transform;
      const back = parsePlacement(tf, frameW, r);
      expect(back.tx).toBeCloseTo(c.tx, 1);
      expect(back.ty).toBeCloseTo(c.ty, 1);
      expect(back.rotate).toBeCloseTo(c.rotate, 1);
      expect(back.scaleX).toBeCloseTo(c.scaleX, 3);
      expect(back.scaleY).toBeCloseTo(c.scaleY, 3);
    });
  }
});
