import { describe, it, expect } from "vitest";
import { filterClasses } from "../../src/class-panel-logic";

// The CSS-classes sub-panel search: case-insensitive substring, empty query = full list.
describe("filterClasses (class panel search)", () => {
  const classes = ["rounded", "Shadow", "border-thick", "grayscale", "ROUND-frame"];

  it("returns the full list (a copy) for an empty query", () => {
    const out = filterClasses(classes, "");
    expect(out).toEqual(classes);
    expect(out).not.toBe(classes); // a copy, not the same reference
  });

  it("returns the full list for a whitespace-only query", () => {
    expect(filterClasses(classes, "   ")).toEqual(classes);
  });

  it("matches a case-insensitive substring", () => {
    expect(filterClasses(classes, "round")).toEqual(["rounded", "ROUND-frame"]);
  });

  it("matches regardless of the query's case", () => {
    expect(filterClasses(classes, "SHAD")).toEqual(["Shadow"]);
  });

  it("matches an interior substring, not just a prefix", () => {
    expect(filterClasses(classes, "thick")).toEqual(["border-thick"]);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(filterClasses(classes, "  shadow  ")).toEqual(["Shadow"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterClasses(classes, "zzz")).toEqual([]);
  });

  it("preserves the original order of the input", () => {
    expect(filterClasses(["b", "a", "c"], "")).toEqual(["b", "a", "c"]);
  });
});
