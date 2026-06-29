import { describe, it, expect } from "vitest";
import { clickDismissesToolbar, isEngaged } from "../../src/toolbar-region-logic";

// Bug 62 (+ click-boundary follow-up) — the click-away dismiss decision (crop EXEMPT). The live half
// (the panel actually closing + persisting ONE source write on click-away, and crop staying open with
// no write) is the read-DOM-back CDP guard tests/cdp/verify-region-clickaway.mjs (obsidian/CM-coupled,
// not a vitest unit — Lesson 6).
describe("clickDismissesToolbar — Bug 62 click-away dismiss decision", () => {
  describe("a modal filter/size panel is open → boundary is the SUB-PANEL, not the whole region", () => {
    it("closes when the click lands OUTSIDE the panel — even ON THE IMAGE (the reported bug)", () => {
      // insideRegion true (the image is in the hover region) but insidePanel false → still closes.
      expect(clickDismissesToolbar({ cropActive: false, panelOpen: true, insidePanel: false, insideRegion: true })).toBe(true);
    });

    it("closes when the click lands in empty editor space (outside panel AND region)", () => {
      expect(clickDismissesToolbar({ cropActive: false, panelOpen: true, insidePanel: false, insideRegion: false })).toBe(true);
    });

    it("does NOT close when the click is inside the panel itself (or the toolbar chrome)", () => {
      expect(clickDismissesToolbar({ cropActive: false, panelOpen: true, insidePanel: true, insideRegion: true })).toBe(false);
    });
  });

  describe("no panel open (bare toolbar) → boundary is the whole active region", () => {
    it("dismisses on an active click OUTSIDE the region", () => {
      expect(clickDismissesToolbar({ cropActive: false, panelOpen: false, insidePanel: false, insideRegion: false })).toBe(true);
    });

    it("does NOT dismiss when the click lands inside the region (toolbar / palette / image)", () => {
      expect(clickDismissesToolbar({ cropActive: false, panelOpen: false, insidePanel: false, insideRegion: true })).toBe(false);
    });
  });

  describe("crop wins over everything — no click ends crop (only its own ✓/✗/Esc/toggle)", () => {
    it("NEVER dismisses while cropping, even on an outside click", () => {
      expect(clickDismissesToolbar({ cropActive: true, panelOpen: false, insidePanel: false, insideRegion: false })).toBe(false);
    });

    it("NEVER dismisses while cropping, even with a panel flag set", () => {
      expect(clickDismissesToolbar({ cropActive: true, panelOpen: true, insidePanel: false, insideRegion: false })).toBe(false);
    });
  });
});

// AD12 — the one engagement predicate. The live half (the reveal PIN, the dismiss auto-clear, the
// toolbar greyed/active state actually reading this) is CDP (Obsidian/CM-coupled); the union itself is
// the pure unit. Every cross-cutting "is this image active?" decision reads it (replacing the scattered
// `filterPanel || classPanel || submenu || cropEditor` chain).
describe("isEngaged — AD12 the one engagement predicate (the union)", () => {
  const NONE = { cursorOnLine: false, hover: false, selected: false, panelOpen: false, cropActive: false };

  it("is FALSE only when the image is fully disengaged (every input off)", () => {
    expect(isEngaged(NONE)).toBe(false);
  });

  it("is TRUE from ANY single member of the union — each path engages on its own", () => {
    expect(isEngaged({ ...NONE, cursorOnLine: true })).toBe(true); // cursor on the image's line
    expect(isEngaged({ ...NONE, hover: true })).toBe(true);        // pointer hover
    expect(isEngaged({ ...NONE, selected: true })).toBe(true);     // selected / editor focused
    expect(isEngaged({ ...NONE, panelOpen: true })).toBe(true);    // filter / class / sub-menu open
    expect(isEngaged({ ...NONE, cropActive: true })).toBe(true);   // a crop session
  });

  it("stays TRUE while ANY member holds — losing the cursor does not disengage if a panel is still open", () => {
    // the Bug 86 case: cursor leaves the line mid-interaction, but the open panel keeps it engaged
    expect(isEngaged({ ...NONE, cursorOnLine: false, panelOpen: true })).toBe(true);
    expect(isEngaged({ cursorOnLine: true, hover: true, selected: true, panelOpen: true, cropActive: true })).toBe(true);
  });
});
