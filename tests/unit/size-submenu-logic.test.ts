import { describe, it, expect } from "vitest";
import { sizePresets } from "../../src/size-submenu-logic";

// F24 — size is ORTHOGONAL to layout now: the presets set width/height ONLY (the inline state moved
// to the flat `layout` field, set via the layout buttons). "icon" is just a line-height height; pair
// it with the inline layout state for an in-text icon. Fails if a preset re-introduces an inline flag.
describe("sizePresets (F24) — size is decoupled from layout", () => {
  const presets = sizePresets({ small: 200, medium: 400, large: 800 });
  const by = (k: string) => presets.find((p) => p.key === k)!;

  it("icon sets a line-height height only (no layout coupling)", () => {
    expect(by("icon").height).toBe("1.5em");
    expect(by("icon").width).toBeNull();
    expect("inline" in by("icon")).toBe(false);
  });

  it("small/medium/large bake the configured px width", () => {
    expect(by("small").width).toBe("200px");
    expect(by("medium").width).toBe("400px");
    expect(by("large").width).toBe("800px");
    for (const k of ["small", "medium", "large"]) expect(by(k).height).toBeNull();
  });

  it("original clears width and height", () => {
    expect(by("original")).toMatchObject({ width: null, height: null });
  });
});
