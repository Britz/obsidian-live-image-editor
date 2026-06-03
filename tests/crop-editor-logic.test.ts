import { describe, it, expect } from "vitest";
import { snapTranslate, snapAngle, snapScale, toCropResult } from "../src/crop-editor-logic";

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

describe("toCropResult (editor state → native transform + box w/h, AD2)", () => {
  it("emits translate% (box-relative), rotate, scale + the cut-frame box size", () => {
    // baseline = box width = 200; frame 200×150; r = 2 → img display height = 100.
    const r = toCropResult({ x: 50, y: 25 }, { w: 200, h: 150 }, 0, 1, 200, 2);
    expect(r.transform).toBe("translate(25%, 25%) rotate(0deg) scale(1)");
    expect(r.width).toBe("200px");
    expect(r.height).toBe("150px");
  });
  it("re-expresses the editor scale against the box-width baseline", () => {
    // editor baseline 400, frame width 200, editor scale 1 → render scale = 1·400/200 = 2.
    const r = toCropResult({ x: 0, y: 0 }, { w: 200, h: 200 }, 0, 1, 400, 1);
    expect(r.transform).toContain("scale(2)");
  });
  it("produces integer-px cut frame and a quantized angle", () => {
    const r = toCropResult({ x: 0, y: 0 }, { w: 123.9, h: 45.1 }, 12.34, 1, 124, 1);
    expect(r.width).toBe("124px");
    expect(r.height).toBe("45px");
    expect(r.transform).toContain("rotate(12.3deg)");
  });
});
