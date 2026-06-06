import { describe, it, expect } from "vitest";
import { findImageInText, findImageInLine, firstEmbedInLine, allEmbedsInText, spansOverlappingRanges } from "../../src/image-resolver";

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

// firstEmbedInLine — the command-palette / hotkey target resolver: the image on the editor's
// cursor line, regardless of which file it is (no basename to match against).
describe("firstEmbedInLine — cursor-line command target", () => {
  it("returns the first embed on the line in column order", () => {
    const loc = firstEmbedInLine("text ![[a.png]]{rotate=90} ![b](c.png)", 3);
    expect(loc?.line).toBe(3);
    expect(loc?.filename).toBe("a.png");
    expect(loc?.params).toBe("rotate=90");
  });

  it("finds an unedited (no-{…}) embed too — so a fresh image is still a target", () => {
    expect(firstEmbedInLine("![[a.png]]", 0)?.params).toBe("");
  });

  it("returns null on a line with no embed", () => {
    expect(firstEmbedInLine("just prose, no image here", 1)).toBeNull();
  });
});

// allEmbedsInText — the page-scope ("reset all images") building block: every embed across the
// whole note, in source order, with the {…} block range each (headEnd→end) for stripping.
describe("allEmbedsInText — page-scope enumeration", () => {
  const src = [
    "![a](one.png){rotate=90}",
    "no image here",
    "![[two.png|300]]{flip=horizontal} and ![c](three.png)",
  ].join("\n");

  it("returns every embed across all lines in source order", () => {
    const all = allEmbedsInText(src);
    expect(all.map((e) => e.filename)).toEqual(["one.png", "two.png|300", "three.png"]);
    expect(all.map((e) => e.line)).toEqual([0, 2, 2]);
  });

  it("flags which embeds carry a {…} transform block (params !== '')", () => {
    const edited = allEmbedsInText(src).filter((e) => e.params !== "");
    expect(edited.map((e) => e.filename)).toEqual(["one.png", "two.png|300"]);
  });

  it("exposes the {…} block range (headEnd→end) so a reset strips only the block", () => {
    const [first] = allEmbedsInText("![a](one.png){rotate=90}");
    // headEnd sits right after the embed head ')'; end after the closing '}'.
    expect("![a](one.png){rotate=90}".slice(first.headEnd, first.end)).toBe("{rotate=90}");
  });

  it("returns [] for a note with no images", () => {
    expect(allEmbedsInText("just\nprose\n")).toEqual([]);
  });
});

// spansOverlappingRanges — the pure core of multi-image selection targeting: which embed spans a
// non-empty selection range covers. Drives whether a command runs on 1 image or several.
describe("spansOverlappingRanges — selection → target embeds", () => {
  // three embeds at offsets [0,10), [20,30), [40,50)
  const spans = [[0, 10], [20, 30], [40, 50]] as const;

  it("picks every embed a single wide range overlaps", () => {
    expect(spansOverlappingRanges(spans, [[5, 45]])).toEqual([0, 1, 2]);
  });

  it("picks only the embeds actually touched", () => {
    expect(spansOverlappingRanges(spans, [[25, 45]])).toEqual([1, 2]);
  });

  it("unions across multiple ranges (multi-cursor), each index at most once", () => {
    expect(spansOverlappingRanges(spans, [[0, 5], [42, 48], [1, 3]])).toEqual([0, 2]);
  });

  it("does NOT select an embed the range merely abuts (half-open overlap)", () => {
    // a caret/selection ending exactly at the embed start (10) must not grab the next embed [20,30)
    expect(spansOverlappingRanges(spans, [[10, 20]])).toEqual([]);
    expect(spansOverlappingRanges(spans, [[0, 0]])).toEqual([]); // empty range selects nothing
  });
});
