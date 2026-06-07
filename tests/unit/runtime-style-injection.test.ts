import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Guard for the Obsidian-review `no-forbidden-elements` error class. The standalone runtime
// (`src/runtime.ts` → `lie-runtime.js`) is scanned by the review bot even though it never runs
// inside Obsidian, and a `createElement("style")` there failed the review twice (review-0.6.0 then
// review-0.6.1). The fix is a constructable stylesheet via `adoptedStyleSheets`; this test fails
// the moment a `<style>` element creeps back into the runtime, so the gate catches it before the
// bot does (Decision 29 / Lesson 18). Source-text assertion — the runtime is browser-only (no
// Obsidian, real `CSSStyleSheet`) and cannot be imported into jsdom unit tests.
describe("runtime CSS injection is rule-clean (no <style> element)", () => {
  const raw = readFileSync(new URL("../../src/runtime.ts", import.meta.url), "utf8");
  // Strip comments — the file's own comments legitimately NAME the forbidden API to explain why it
  // is avoided; we assert on the actual code, not the prose describing it.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("does not create a <style> element", () => {
    expect(code).not.toMatch(/createElement\(\s*["']style["']\s*\)/);
    expect(code).not.toMatch(/createEl\(\s*["']style["']/);
  });

  it("injects CSS via a constructable stylesheet (adoptedStyleSheets)", () => {
    expect(code).toContain("adoptedStyleSheets");
    expect(code).toMatch(/new CSSStyleSheet\(\)/);
  });
});
