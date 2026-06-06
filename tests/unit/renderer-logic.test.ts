import { describe, it, expect } from "vitest";
import { boxAspectRatio, innerImageSize, rotatedAabb, nativeBoxWidth, estimatedBlockHeight, isTallFloat, TALL_FLOAT_THRESHOLD_PX } from "../../src/renderer-logic";

const round = (v: number) => Math.round(v);

describe("boxAspectRatio (box aspect = intrinsic ratio + angle, AD6)", () => {
  it("keeps the intrinsic ratio for 0° / 180° (degenerate case is not special)", () => {
    expect(boxAspectRatio(2, 0)).toBe(2);
    expect(boxAspectRatio(2, 180)).toBe(2);
  });
  it("swaps the ratio for 90° / 270° (the rotated bounding box)", () => {
    expect(boxAspectRatio(2, 90)).toBe(0.5);
    expect(boxAspectRatio(2, 270)).toBe(0.5);
  });
  it("degrades sensibly for a missing/garbage ratio (T11)", () => {
    expect(boxAspectRatio(0, 90)).toBe(1);
    expect(boxAspectRatio(NaN, 0)).toBe(1);
  });
});

describe("innerImageSize (inner image in box-relative %, box → image)", () => {
  it("fills the box at 0° / 180°", () => {
    expect(innerImageSize(2, 0)).toEqual({ w: 100, h: 100 });
    expect(innerImageSize(2, 180)).toEqual({ w: 100, h: 100 });
  });
  it("keeps its own dimensions inside the swapped box at 90° / 270°", () => {
    // r = 2 → img width = 200% of box width, height = 50% of box height.
    expect(innerImageSize(2, 90)).toEqual({ w: 200, h: 50 });
    expect(innerImageSize(2, 270)).toEqual({ w: 200, h: 50 });
  });
});

describe("rotatedAabb (export output sizing at original resolution)", () => {
  it("swaps width/height for a quarter turn", () => {
    const b = rotatedAabb(400, 600, 90);
    expect(round(b.w)).toBe(600);
    expect(round(b.h)).toBe(400);
  });
  it("is the image's own size at 0°", () => {
    const b = rotatedAabb(500, 300, 0);
    expect(round(b.w)).toBe(500);
    expect(round(b.h)).toBe(300);
  });
  it("is the true AABB for a free angle", () => {
    const b = rotatedAabb(100, 100, 45);
    expect(round(b.w)).toBe(141); // 100·(cos45+sin45) ≈ 141.42
    expect(round(b.h)).toBe(141);
  });
});

describe("nativeBoxWidth (no-explicit-width native cap — Bug 78/79; cropped OR not, one decision)", () => {
  // The no-width box (a non-cropped image, OR a cropped image whose width was removed) must fall
  // back to the ORIGINAL intrinsic dimension on the rotation-correct axis — never an empty/0-width
  // box (Bug 78). buildLayers routes BOTH branches through this so a cleared/native-default image
  // (Bug 79: clearStaleTransform re-renders to the empty transform instead of unwrapping) sizes
  // identically to a freshly rendered native image.
  it("caps on the ORIGINAL WIDTH at 0° / 180° (axis unswapped)", () => {
    expect(nativeBoxWidth(400, 600, 0)).toBe(400);
    expect(nativeBoxWidth(400, 600, 180)).toBe(400);
  });
  it("caps on the ORIGINAL HEIGHT at 90° / 270° (rotated bounding box swaps the axis)", () => {
    expect(nativeBoxWidth(400, 600, 90)).toBe(600);
    expect(nativeBoxWidth(400, 600, 270)).toBe(600);
  });
  it("is always a positive width (never 0 → the box can't collapse, Bug 78)", () => {
    for (const deg of [0, 90, 180, 270, 45, 137]) {
      expect(nativeBoxWidth(800, 450, deg)).toBeGreaterThan(0);
    }
  });
  it("is the true rotated AABB width for a free angle (matches rotatedAabb)", () => {
    expect(nativeBoxWidth(100, 100, 45)).toBe(Math.round(rotatedAabb(100, 100, 45).w));
  });
});

describe("estimatedBlockHeight (synchronous CM6 height estimate)", () => {
  it("prefers an explicit px height", () => {
    expect(estimatedBlockHeight({ heightPx: 250 })).toBe(250);
  });
  it("derives from a px width and the box aspect-ratio", () => {
    expect(estimatedBlockHeight({ widthPx: 400, aspectRatio: 2 })).toBe(200);
  });
  it("assumes a typical landscape ratio for a width-only image", () => {
    expect(estimatedBlockHeight({ widthPx: 400 })).toBe(280);
  });
  it("falls back to a constant for an unsized image", () => {
    expect(estimatedBlockHeight({})).toBe(480);
  });
});

describe("isTallFloat (the tall-float cap — stack instead of wrap above the CM6 margin)", () => {
  it("is false at or below the threshold (a normal small float)", () => {
    expect(isTallFloat({ heightPx: TALL_FLOAT_THRESHOLD_PX })).toBe(false);
    expect(isTallFloat({ widthPx: 180 })).toBe(false);            // est 126
    expect(isTallFloat({ widthPx: 400, aspectRatio: 2 })).toBe(false); // est 200
  });
  it("is true above the threshold (explicit tall height, wide image, or unsized)", () => {
    expect(isTallFloat({ heightPx: 300 })).toBe(true);
    expect(isTallFloat({ widthPx: 400 })).toBe(true);              // est 280
    expect(isTallFloat({})).toBe(true);                           // est 480 (unsized)
  });
});
