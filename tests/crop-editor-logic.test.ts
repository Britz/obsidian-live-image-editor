import { describe, it, expect } from "vitest";
import { snapTranslate, snapAngle, snapScale, toCropData } from "../src/crop-editor-logic";

describe("crop live snapping (F7)", () => {
  it("snaps drag position to whole pixels", () => {
    expect(snapTranslate(10.4, -3.6)).toEqual({ x: 10, y: -4 });
    expect(snapTranslate(0.5, 0.49)).toEqual({ x: 1, y: 0 });
  });

  it("snaps rotation to 0.1 degree steps", () => {
    expect(snapAngle(12.34)).toBe(12.3);
    expect(snapAngle(12.35)).toBeCloseTo(12.4, 5);
    expect(snapAngle(-0.04)).toBe(-0);
  });

  it("snaps scale to 1/1000", () => {
    expect(snapScale(1.23456)).toBe(1.235);
    expect(snapScale(0.9999)).toBe(1);
  });
});

describe("toCropData", () => {
  it("negates translate into the crop offset and quantizes", () => {
    const crop = toCropData({ x: -12.2, y: 7.8 }, { w: 400.4, h: 300.6 }, 45.27, 1.5004);
    expect(crop).toEqual({ x: 12, y: -8, w: 400, h: 301, rotate: 45.3, scale: 1.5 });
  });

  it("produces integer pixel cut box", () => {
    const crop = toCropData({ x: 0, y: 0 }, { w: 123.9, h: 45.1 }, 0, 1);
    expect(Number.isInteger(crop.x)).toBe(true);
    expect(Number.isInteger(crop.y)).toBe(true);
    expect(Number.isInteger(crop.w)).toBe(true);
    expect(Number.isInteger(crop.h)).toBe(true);
  });
});
