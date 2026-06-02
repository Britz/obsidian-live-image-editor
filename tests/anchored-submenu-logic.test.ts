import { describe, it, expect } from "vitest";
import { placeSubmenu, Rect } from "../src/anchored-submenu-logic";

const vp = { width: 1200, height: 800 };
const rect = (o: Partial<Rect>): Rect => ({
  top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...o,
});

describe("placeSubmenu", () => {
  it("hangs under the toolbar, left-aligned", () => {
    const p = placeSubmenu(rect({ top: 100, left: 200, right: 260, bottom: 130, width: 60, height: 30 }),
      { width: 220, height: 120 }, "under-toolbar", vp);
    expect(p.left).toBe(200);
    expect(p.top).toBe(138); // bottom 130 + gap 8
  });

  it("flips a beside-image panel to the left when it would overflow the right (allowFlip default)", () => {
    // anchor near the right edge: right=1150, panel 300 wide → would overflow → flip left
    const p = placeSubmenu(rect({ top: 100, left: 900, right: 1150, bottom: 400, width: 250, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp);
    expect(p.left).toBeLessThan(900); // landed on the left side
  });

  it("does NOT flip left when allowFlip is false — clamps to the right edge (Bug 3)", () => {
    const p = placeSubmenu(rect({ top: 100, left: 900, right: 1150, bottom: 400, width: 250, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, false);
    // right edge clamp: viewport 1200 - panel 300 - margin 6 = 894; stays on the right, not over the left.
    expect(p.left).toBe(894);
    expect(p.left).toBeGreaterThan(800);
  });

  it("docks beside the image on the right when there is room", () => {
    const p = placeSubmenu(rect({ top: 100, left: 200, right: 460, bottom: 400, width: 260, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, false);
    expect(p.left).toBe(468); // right 460 + gap 8
    expect(p.top).toBe(100);
  });
});
