import { describe, it, expect } from "vitest";
import { clickDismissesToolbar } from "../../src/toolbar-region-logic";

// Bug 54 (+ click-boundary follow-up) — the click-away dismiss decision (crop EXEMPT). The live half
// (the panel actually closing + persisting ONE source write on click-away, and crop staying open with
// no write) is the read-DOM-back CDP guard tests/cdp/verify-region-clickaway.mjs (obsidian/CM-coupled,
// not a vitest unit — Lesson 6).
describe("clickDismissesToolbar — Bug 54 click-away dismiss decision", () => {
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
