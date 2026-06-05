import { describe, it, expect } from "vitest";
import { clickDismissesToolbar } from "../src/toolbar-region-logic";

// Bug 1 — the click-away dismiss decision (crop EXEMPT). The live half (the panel actually closing +
// persisting ONE source write on click-away, and crop staying open with no write) is the read-DOM-back
// CDP guard scripts/verify-region-clickaway.mjs (obsidian/CM-coupled, not a vitest unit — T-L6).
describe("clickDismissesToolbar — Bug 1 click-away dismiss decision", () => {
  it("dismisses on an active click OUTSIDE the region (no crop) — closes + persists filter/size", () => {
    expect(clickDismissesToolbar({ insideRegion: false, cropActive: false })).toBe(true);
  });

  it("does NOT dismiss when the click lands inside the region (toolbar / panel / palette / image)", () => {
    expect(clickDismissesToolbar({ insideRegion: true, cropActive: false })).toBe(false);
  });

  it("NEVER dismisses while cropping — a stray outside click must not destroy the in-place session", () => {
    expect(clickDismissesToolbar({ insideRegion: false, cropActive: true })).toBe(false);
  });

  it("crop wins over the inside/outside test — no click ends crop (only its own ✓/✗/Esc/toggle)", () => {
    expect(clickDismissesToolbar({ insideRegion: true, cropActive: true })).toBe(false);
  });
});
