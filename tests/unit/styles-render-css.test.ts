import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { RENDER_CSS } from "../../src/render-core";

// R0 single-source guard. The 3-layer LAYER rules have ONE source — `RENDER_CSS` in render-core.ts.
// The standalone runtime injects that string verbatim via a <style> (a foreign page has no
// Obsidian-loaded stylesheet); the PLUGIN no longer injects a <style> (Obsidian-review
// `no-forbidden-elements`) and instead relies on Obsidian loading `styles.css`, which carries a
// byte-identical copy of the block between its `>>> RENDER_CSS >>>` markers. If the two ever drift
// the render would differ in Obsidian vs. off-Obsidian — this test fails the moment they do.
describe("RENDER_CSS ↔ styles.css single source (R0)", () => {
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  it("styles.css carries the RENDER_CSS block verbatim", () => {
    expect(css).toContain(RENDER_CSS.trim());
  });

  it("styles.css does NOT re-inject a <style> element note — RENDER_CSS lives between the sync markers", () => {
    expect(css).toContain("/* >>> RENDER_CSS (keep in sync with src/render-core.ts) >>> */");
    expect(css).toContain("/* <<< RENDER_CSS <<< */");
  });
});
