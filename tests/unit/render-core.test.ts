import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { CLAIM_SELECTOR, orientationTransform } from "../../src/render-core";

// The runtime claims an image IFF it carries a distinctive runtime-only key (AB7a). A bare
// `filter=` is runtime-only (a browser ignores the bare attribute), so the runtime must claim a
// filter-only image to apply the CSS filter. Fails if `filter` is dropped from the selector.
describe("CLAIM_SELECTOR (AB7a) — runtime-only keys are claimed", () => {
  for (const key of ["rotate", "flip", "transform", "aspect-ratio", "filter"]) {
    it(`claims [${key}] and its data- variant`, () => {
      expect(CLAIM_SELECTOR).toContain(`[${key}]`);
      expect(CLAIM_SELECTOR).toContain(`[data-${key}]`);
    });
  }

  it("claims the explicit .lie marker", () => {
    expect(CLAIM_SELECTOR).toContain(".lie");
  });

  it("does NOT claim native-faithful keys alone (align/width/class)", () => {
    expect(CLAIM_SELECTOR).not.toContain("[align]");
    expect(CLAIM_SELECTOR).not.toContain("[width]");
  });
});

describe("orientationTransform (shared by render-core's frame + the crop editor's chrome)", () => {
  it("is just the centring translate at identity (deg 0, no flip)", () => {
    expect(orientationTransform(0, false, false)).toBe("translate(-50%, -50%)");
  });
  it("appends rotate() for a nonzero deg", () => {
    expect(orientationTransform(90, false, false)).toBe("translate(-50%, -50%) rotate(90deg)");
  });
  it("appends scaleX(-1)/scaleY(-1) for flipH/flipV", () => {
    expect(orientationTransform(0, true, false)).toBe("translate(-50%, -50%) scaleX(-1)");
    expect(orientationTransform(0, false, true)).toBe("translate(-50%, -50%) scaleY(-1)");
    expect(orientationTransform(0, true, true)).toBe("translate(-50%, -50%) scaleX(-1) scaleY(-1)");
  });
  it("composes rotate + both flips in one string", () => {
    expect(orientationTransform(45, true, true)).toBe("translate(-50%, -50%) rotate(45deg) scaleX(-1) scaleY(-1)");
  });
});

describe("crop-editor reuses render-core's orientationTransform (no duplicate formula)", () => {
  const src = readFileSync(new URL("../../src/crop-editor.ts", import.meta.url), "utf8");
  it("imports orientationTransform from render-core", () => {
    expect(src).toMatch(/import\s*\{[^}]*orientationTransform[^}]*\}\s*from\s*"\.\/render-core"/);
  });
  it("does not carry its own translate(-50%, -50%)-building formula", () => {
    expect(src).not.toMatch(/const parts = \["translate\(-50%, -50%\)"\]/);
  });
});
