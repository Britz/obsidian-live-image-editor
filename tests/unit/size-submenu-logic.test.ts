import { describe, it, expect } from "vitest";
import { sizePresets } from "../../src/size-submenu-logic";

// F24 / F17 — the "icon" preset must couple to the INLINE rendering, not merely set a height.
// Fails if icon's inline flag is dropped (the clean-room gap: icon set height only).
describe("sizePresets (F24) — icon couples to inline (F17)", () => {
  const presets = sizePresets({ small: 200, medium: 400, large: 800 });
  const by = (k: string) => presets.find((p) => p.key === k)!;

  it("icon sets inline=true (the inline-icon rendering, F17) at a line-height size", () => {
    expect(by("icon").inline).toBe(true);
    expect(by("icon").height).toBe("1.5em");
    expect(by("icon").width).toBeNull();
  });

  it("small/medium/large bake the configured px width and are NOT inline", () => {
    expect(by("small").width).toBe("200px");
    expect(by("medium").width).toBe("400px");
    expect(by("large").width).toBe("800px");
    for (const k of ["small", "medium", "large"]) expect(by(k).inline).toBe(false);
  });

  it("original clears width, height and inline", () => {
    expect(by("original")).toMatchObject({ width: null, height: null, inline: false });
  });
});
