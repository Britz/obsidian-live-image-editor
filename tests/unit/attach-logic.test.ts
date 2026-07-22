import { describe, it, expect } from "vitest";
import { isHiddenHostCopy, DisplayNode } from "../../src/attach-logic";

// A table cell's static render is left in the DOM (with our earlier decoration still on it) once
// Obsidian hides it via inline `display:none` and swaps in the row's own live cell editor. Attach
// must recognise that hidden copy and leave it alone (idempotent per host copy, Bug 122).
describe("isHiddenHostCopy", () => {
  it("is false for a plain node with no hidden ancestor", () => {
    const leaf: DisplayNode = { style: {}, parentElement: { style: {}, parentElement: null } };
    expect(isHiddenHostCopy(leaf)).toBe(false);
  });

  it("is true when the node itself is display:none", () => {
    const leaf: DisplayNode = { style: { display: "none" }, parentElement: null };
    expect(isHiddenHostCopy(leaf)).toBe(true);
  });

  it("is true when an ANCESTOR (e.g. the table-cell-wrapper) is display:none", () => {
    const wrapper: DisplayNode = { style: { display: "none" }, parentElement: null };
    const leaf: DisplayNode = { style: {}, parentElement: wrapper };
    expect(isHiddenHostCopy(leaf)).toBe(true);
  });

  it("is false for null/undefined", () => {
    expect(isHiddenHostCopy(null)).toBe(false);
    expect(isHiddenHostCopy(undefined)).toBe(false);
  });

  it("does not false-positive on other display values", () => {
    const leaf: DisplayNode = { style: { display: "inline-block" }, parentElement: null };
    expect(isHiddenHostCopy(leaf)).toBe(false);
  });
});
