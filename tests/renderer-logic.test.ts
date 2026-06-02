import { describe, it, expect } from "vitest";
import { rotatedBox, cropBoxSize, estimatedBlockHeight } from "../src/renderer-logic";

const round = (v: number) => Math.round(v);

describe("estimatedBlockHeight (synchronous CM6 height estimate)", () => {
  it("is exact for a crop (size is in the {…} block)", () => {
    expect(estimatedBlockHeight({ crop: { w: 700, h: 500 }, width: 320 })).toBe(229);
    expect(estimatedBlockHeight({ crop: { w: 700, h: 500 } })).toBe(500);
  });
  it("uses an explicit height", () => {
    expect(estimatedBlockHeight({ height: 250 })).toBe(250);
  });
  it("assumes a landscape ratio for a width-only image", () => {
    expect(estimatedBlockHeight({ width: 400 })).toBe(280);
  });
  it("falls back to a sensible constant for an unsized image", () => {
    expect(estimatedBlockHeight({})).toBe(480);
  });
});

describe("cropBoxSize", () => {
  const crop = { w: 700, h: 500 };

  it("uses the cut's own size when neither width nor height is given", () => {
    const { w, h, scale } = cropBoxSize(crop);
    expect(w).toBe(700);
    expect(h).toBe(500);
    expect(scale).toBe(1);
  });

  it("keeps the cut's aspect ratio when only a width is given (no empty band — Bug 2)", () => {
    // width 320 on a 700×500 cut → height 320*500/700 ≈ 229, scale 320/700.
    const { w, h, scale } = cropBoxSize(crop, 320);
    expect(w).toBe(320);
    expect(round(h)).toBe(229);
    expect(scale).toBeCloseTo(320 / 700, 5);
  });

  it("keeps the cut's aspect ratio when only a height is given", () => {
    const { w, h, scale } = cropBoxSize(crop, undefined, 250);
    expect(round(w)).toBe(350);
    expect(h).toBe(250);
    expect(scale).toBeCloseTo(0.5, 5);
  });

  it("honours an explicit width AND height (letterbox via scale = min if aspect differs)", () => {
    const { w, h, scale } = cropBoxSize(crop, 700, 700);
    expect(w).toBe(700);
    expect(h).toBe(700);
    expect(scale).toBeCloseTo(1, 5); // min(700/700, 700/500) = 1
  });
});

describe("rotatedBox", () => {
  it("swaps width/height for a 90° turn that fits the column", () => {
    // 400x600 portrait rotated 90° → bounding box 600 wide, 400 tall; column is wide.
    const { bw, bh, scale } = rotatedBox(400, 600, 90, 1000);
    expect(round(bw)).toBe(600);
    expect(round(bh)).toBe(400);
    expect(scale).toBe(1);
  });

  it("treats 270° the same magnitude as 90°", () => {
    const a = rotatedBox(400, 600, 90, 1000);
    const b = rotatedBox(400, 600, 270, 1000);
    expect(round(b.bw)).toBe(round(a.bw));
    expect(round(b.bh)).toBe(round(a.bh));
  });

  it("scales down when the rotated box is wider than the column", () => {
    // 800x600 rotated 90° → box is 600 wide → fits a 300 column at scale 0.5.
    const { bw, bh, scale } = rotatedBox(600, 800, 90, 400);
    // unscaled box would be 800 wide (sin/cos of 90°): 800 > 400 → scale 0.5
    expect(scale).toBeCloseTo(0.5, 5);
    expect(round(bw)).toBe(400);
    expect(round(bh)).toBe(300);
  });

  it("leaves a landscape image unrotated-equivalent at 0° (no growth)", () => {
    const { bw, bh, scale } = rotatedBox(500, 300, 0, 1000);
    expect(round(bw)).toBe(500);
    expect(round(bh)).toBe(300);
    expect(scale).toBe(1);
  });

  it("never scales up (box narrower than column stays scale 1)", () => {
    const { scale } = rotatedBox(200, 100, 90, 1000);
    expect(scale).toBe(1);
  });

  it("sizes the box to a user-set target width (resize handle on a rotated image)", () => {
    // natural 90° box is 600 wide; ask for 300 → scale 0.5, height follows.
    const { bw, bh, scale } = rotatedBox(400, 600, 90, 1000, 300);
    expect(round(bw)).toBe(300);
    expect(round(bh)).toBe(200);
    expect(scale).toBeCloseTo(0.5, 5);
  });

  it("caps a target width wider than the column", () => {
    const { bw } = rotatedBox(400, 600, 90, 500, 900);
    expect(round(bw)).toBe(500);
  });
});
