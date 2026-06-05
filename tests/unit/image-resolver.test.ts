import { describe, it, expect } from "vitest";
import { findImageInText, findImageInLine } from "../../src/image-resolver";

// F2 / AB3 — the reading-view resolver must map the n-th rendered embed of a repeated file to
// the n-th SOURCE embed, not merely the first basename match (the Bug-48 failure mode, here on
// the render path). These fail if findImageInText returns the first occurrence regardless of n.
describe("findImageInText — position-exact duplicate resolution (F2/AB3)", () => {
  const src = [
    "![a](sample.png){rotate=90}",
    "",
    "![b](sample.png){flip=horizontal}",
    "",
    "![c](other.png){rotate=45}",
  ].join("\n");

  it("resolves the first occurrence at index 0", () => {
    const loc = findImageInText(src, "sample.png", 0);
    expect(loc?.line).toBe(0);
    expect(loc?.params).toBe("rotate=90");
  });

  it("resolves the SECOND occurrence at index 1 — not the first basename match", () => {
    const loc = findImageInText(src, "sample.png", 1);
    expect(loc?.line).toBe(2);
    expect(loc?.params).toBe("flip=horizontal");
  });

  it("defaults to the first occurrence when no index is given", () => {
    expect(findImageInText(src, "sample.png")?.line).toBe(0);
  });

  it("returns null past the last occurrence", () => {
    expect(findImageInText(src, "sample.png", 2)).toBeNull();
  });

  it("counts occurrences across both link forms, in column order on a shared line", () => {
    const mixed = "![[sample.png]]{rotate=90} and ![x](sample.png){rotate=180}";
    expect(findImageInText(mixed, "sample.png", 0)?.params).toBe("rotate=90");
    expect(findImageInText(mixed, "sample.png", 1)?.params).toBe("rotate=180");
  });

  it("matches a wikilink with a |size suffix by basename and preserves the path", () => {
    const loc = findImageInLine("![[img/sample.png|300]]{flip=vertical}", 7, "sample.png");
    expect(loc?.params).toBe("flip=vertical");
    expect(loc?.isWikiLink).toBe(true);
    expect(loc?.filename).toBe("img/sample.png|300");
  });
});
