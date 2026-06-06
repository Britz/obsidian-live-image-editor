import { describe, it, expect } from "vitest";
import { placeSubmenu, Rect, submenuExitEffect } from "../../src/anchored-submenu-logic";

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

  it("flips a beside-image panel to the left when the left side has more room (allowFlip default)", () => {
    // anchor near the right edge: left=900, right=1150 → room left (900) > room right (50) → flip left
    const p = placeSubmenu(rect({ top: 100, left: 900, right: 1150, bottom: 400, width: 250, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp);
    expect(p.left).toBeLessThan(900); // landed on the left side
  });

  it("aligns a beside-image panel's top to topAnchorTop (the toolbar), not the image (Bug 87)", () => {
    const p = placeSubmenu(rect({ top: 200, left: 100, right: 360, bottom: 500, width: 260, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, false, undefined, 160);
    expect(p.top).toBe(160); // toolbar top, not the image's 200
  });

  it("slides a beside-image panel up only on a bottom overflow, else sticks to topAnchorTop (Bug 87)", () => {
    // tall panel (760) + toolbar top 160 would overflow → clamps up to maxTop = 800 − 760 − 6 = 34
    const p = placeSubmenu(rect({ top: 200, left: 100, right: 360, bottom: 500, width: 260, height: 300 }),
      { width: 300, height: 760 }, "beside-image", vp, undefined, undefined, false, undefined, 160);
    expect(p.top).toBe(34);
  });

  it("docks right when the right side has more room (Bug 77 — side of more room, not always-right)", () => {
    // anchor on the left of the viewport: left=100, right=360 → room right (840) > room left (100) → right
    const p = placeSubmenu(rect({ top: 100, left: 100, right: 360, bottom: 400, width: 260, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp);
    expect(p.left).toBe(368); // right 360 + gap 8
  });

  it("flips left only WITHIN the content bound — never over the left sidebar (Bug 77 guard)", () => {
    // The editor pane starts at x=600 (the sidebar occupies 0–600). Image at left=620, right=880.
    // Measured against the whole VIEWPORT the left side (620) trounces the right (320) → the OLD,
    // viewport-relative flip would dock left, over the sidebar. Measured within the PANE the left
    // room is only 20 (620-600) vs 320 on the right → right is the roomier side, so it stays right.
    const bound = { left: 600, right: 1200 };
    const p = placeSubmenu(rect({ top: 100, left: 620, right: 880, bottom: 400, width: 260, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, true, bound);
    expect(p.left).toBe(888); // right 880 + gap 8 — did NOT flip onto the sidebar

    // Same anchor WITHOUT the bound → viewport-relative → the left wins → flips left (proves the
    // bound is what holds the panel off the sidebar, not the geometry by itself).
    const noBound = placeSubmenu(rect({ top: 100, left: 620, right: 880, bottom: 400, width: 260, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp);
    expect(noBound.left).toBe(312); // left 620 - gap 8 - panel 300
    expect(noBound.left).toBeLessThan(620);
  });

  it("flips left within the content bound when the pane's left side has room (Bug 77)", () => {
    // Pane starts at x=350. Image near the pane's right edge → room left within the pane is large
    // and the panel fits left of it inside the pane → flips left, staying clear of the sidebar.
    const bound = { left: 350, right: 1200 };
    const p = placeSubmenu(rect({ top: 100, left: 1000, right: 1180, bottom: 400, width: 250, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, true, bound);
    expect(p.left).toBe(692); // left 1000 - gap 8 - panel 300, fully right of the sidebar (≥ 350)
    expect(p.left).toBeGreaterThanOrEqual(350);
  });

  it("left has more room but the panel does not fit there → stays right (Bug 77)", () => {
    // Bound [100, 640]. Image left=300, right=560. room left = 300-100 = 200; room right = 640-560 = 80
    // → left has MORE room, but the panel (320 wide) does NOT fit left of the image inside the pane
    // (300 - gap 8 - 320 = -28 < bound.left 100) → it must stay on the right rather than overhang.
    const p = placeSubmenu(rect({ top: 100, left: 300, right: 560, bottom: 400, width: 260, height: 300 }),
      { width: 320, height: 300 }, "beside-image", vp, undefined, undefined, true, { left: 100, right: 640 });
    expect(p.left).toBe(568); // right 560 + gap 8 (not flipped onto an impossible left)
  });

  it("does NOT flip when allowFlip is false — clamps to the right edge (Bug 64)", () => {
    const p = placeSubmenu(rect({ top: 100, left: 900, right: 1150, bottom: 400, width: 250, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, false);
    // right edge clamp: viewport 1200 - panel 300 - margin 6 = 894; stays on the right, not over the left.
    expect(p.left).toBe(894);
    expect(p.left).toBeGreaterThan(800);
  });

  it("omitting the content bound measures room against the full viewport (backwards-compatible)", () => {
    // No bound passed → defaults to [0, viewport.width]. Image hugging the LEFT viewport edge:
    // room right (940) > room left (10) → docks right, exactly as before the Bug-77 param existed.
    const p = placeSubmenu(rect({ top: 100, left: 10, right: 260, bottom: 400, width: 250, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp);
    expect(p.left).toBe(268); // right 260 + gap 8
  });

  it("docks beside the image on the right when there is room", () => {
    const p = placeSubmenu(rect({ top: 100, left: 200, right: 460, bottom: 400, width: 260, height: 300 }),
      { width: 300, height: 300 }, "beside-image", vp, undefined, undefined, false);
    expect(p.left).toBe(468); // right 460 + gap 8
    expect(p.top).toBe(100);
  });

  it("centers in the viewport, ignoring the anchor (multi-image panel, 0.5.2)", () => {
    const p = placeSubmenu(rect({ top: 100, left: 200, right: 260, bottom: 130, width: 60, height: 30 }),
      { width: 400, height: 200 }, "centered", vp);
    expect(p.left).toBe((1200 - 400) / 2); // 400
    expect(p.top).toBe((800 - 200) / 2);   // 300
  });

  it("clamps a centered panel taller than the viewport to the top margin", () => {
    const p = placeSubmenu(rect({}), { width: 400, height: 900 }, "centered", vp);
    expect(p.top).toBe(6); // margin — top stays visible rather than centering off-screen
  });
});

// The accept/cancel rework (F14/AD8/D6 — restored icons + discard-on-cancel) hinges on the host
// routing the EXIT reason to the right owner callback. The PURE crux is `submenuExitEffect`; the
// live-DOM half (✓ writes the `{…}`, ✗ does NOT and restores the pre-open transform, one undo step,
// toolbar+panel one active region) is the read-DOM-back CDP guard `scripts/verify-submodal-icons.mjs`
// + `scripts/verify-submodal-region.mjs` (obsidian/CM-coupled — not a vitest unit, Lesson 6).
describe("submenuExitEffect — the host's exit-reason routing (restored accept/cancel)", () => {
  it("accept / leave / dismiss / context loss → COMMIT (one source write, auto-persist)", () => {
    expect(submenuExitEffect("commit")).toEqual({ commit: true, cancel: false });
  });

  it("✗ cancel / Esc → CANCEL only (revert the live preview, NO source write)", () => {
    expect(submenuExitEffect("cancel")).toEqual({ commit: false, cancel: true });
  });

  it("plugin unload → SILENT (neither persist nor revert — no write while going away)", () => {
    expect(submenuExitEffect("silent")).toEqual({ commit: false, cancel: false });
  });

  it("commit and cancel are mutually exclusive across every reason (never both, never a double write)", () => {
    for (const exit of ["commit", "cancel", "silent"] as const) {
      const e = submenuExitEffect(exit);
      expect(e.commit && e.cancel).toBe(false);
    }
  });
});
