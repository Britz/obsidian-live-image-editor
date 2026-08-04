import { describe, expect, it } from "vitest";
import { toolbarPresentation } from "../../src/toolbar-placement-logic";

describe("toolbarPresentation", () => {
  it("places a tiny image above", () => expect(toolbarPresentation(24, 40)).toBe("above"));
  it("keeps a large image inset", () => expect(toolbarPresentation(400, 40)).toBe("inset"));
  it("places a short wide image above", () => expect(toolbarPresentation(60, 40)).toBe("above"));
  it("keeps a narrow tall image inset", () => expect(toolbarPresentation(600, 40)).toBe("inset"));
  it("keeps exact 60 percent coverage inset", () => expect(toolbarPresentation(80, 40)).toBe("inset"));
  it("includes the 8px inset in above placement", () => expect(toolbarPresentation(75, 40)).toBe("above"));
  it("rejects invalid measurements", () => {
    for (const [imageHeight, toolbarHeight] of [[0, 40], [80, 0], [NaN, 40], [80, Infinity]]) {
      expect(toolbarPresentation(imageHeight, toolbarHeight)).toBeNull();
    }
  });
});
