import { describe, it, expect } from "vitest";
import { CLAIM_SELECTOR } from "../../src/render-core";

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
