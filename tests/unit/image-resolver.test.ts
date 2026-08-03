import { describe, it, expect } from "vitest";
import {
  findImageInText, findImageInLine, firstEmbedInLine, allEmbedsInText, spansOverlappingRanges, basename,
  isImageEmbedNodeName, locationsInLineRange, currentDocumentLocationPairs, pairImageLocations,
} from "../../src/image-resolver";

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
    expect(findImageInText(mixed, "sample.png", 1)?.block).toBe("{rotate=180}");
  });

  it("matches a wikilink with a |size suffix by basename and preserves the path", () => {
    const loc = findImageInLine("![[img/sample.png|300]]{flip=vertical}", 7, "sample.png");
    expect(loc?.params).toBe("flip=vertical");
    expect(loc?.isWikiLink).toBe(true);
    expect(loc?.filename).toBe("img/sample.png");
  });
});

describe("pairImageLocations", () => {
  it("pairs only the supplied bounded locations and keeps duplicate basenames in order", () => {
    const source = [
      "![[same.png]]{width=10}",
      "| A | B |",
      "| ![[same.png]]{width=20} | ![](same.png){width=30} |",
    ].join("\n");
    const tableLocations = allEmbedsInText(source).slice(1);

    const pairs = pairImageLocations([
      { identity: "first-cell", source: "same.png" },
      { identity: "second-cell", source: "same.png" },
    ], tableLocations);

    expect(pairs?.map(({ identity, location }) => [identity, location.line, location.params])).toEqual([
      ["first-cell", 2, "width=20"],
      ["second-cell", 2, "width=30"],
    ]);
  });

  it("fails closed on basename mismatch", () => {
    const locations = allEmbedsInText("![[a.png]] ![[b.png]]");
    expect(pairImageLocations([
      { identity: 1, source: "a.png" },
      { identity: 2, source: "c.png" },
    ], locations)).toBeNull();
  });

  it("fails closed on cardinality mismatch or repeated identity", () => {
    const locations = allEmbedsInText("![[same.png]] ![[same.png]]");
    expect(pairImageLocations([
      { identity: 1, source: "same.png" },
    ], locations)).toBeNull();
    expect(pairImageLocations([
      { identity: 1, source: "same.png" },
      { identity: 1, source: "same.png" },
    ], locations)).toBeNull();
  });

  it("fails closed on empty rendered or source basenames", () => {
    const location = allEmbedsInText("![[same.png]]")[0]!;
    expect(pairImageLocations([{ identity: 1, source: "" }], [location])).toBeNull();
    expect(pairImageLocations([{ identity: 1, source: "same.png" }], [
      { ...location, filename: "" },
    ])).toBeNull();
  });
});

describe("section-bounded source mapping", () => {
  const locations = allEmbedsInText([
    "![[before.png]]",
    "",
    "![[first.png]]",
    "![](second.png)",
    "",
    "![[after.png]]",
  ].join("\n"));

  it("filters cache-confirmed locations to the inclusive section lines", () => {
    expect(locationsInLineRange(locations, 2, 3)?.map((location) => location.filename)).toEqual([
      "first.png",
      "second.png",
    ]);
  });

  it("rejects invalid section bounds and inconsistent locations", () => {
    expect(locationsInLineRange(locations, -1, 3)).toBeNull();
    expect(locationsInLineRange(locations, 3, 2)).toBeNull();
    expect(locationsInLineRange([{ ...locations[0]!, line: 1.5 }], 0, 3)).toBeNull();
  });

  it("keeps strict pairing inside the bounded section", () => {
    const bounded = locationsInLineRange(locations, 2, 3)!;
    expect(pairImageLocations([
      { identity: "first", source: "first.png" },
      { identity: "second", source: "second.png" },
    ], bounded)?.map(({ identity, location }) => [identity, location.line])).toEqual([
      ["first", 2],
      ["second", 3],
    ]);
    expect(pairImageLocations([
      { identity: "first", source: "first.png" },
    ], bounded)).toBeNull();
    expect(pairImageLocations([
      { identity: "first", source: "second.png" },
      { identity: "second", source: "first.png" },
    ], bounded)).toBeNull();
  });
});

describe("currentDocumentLocationPairs", () => {
  const locations = allEmbedsInText("![[first.png]] ![[second.png]]");
  const identities = ["first", "second"];
  const currentDoc = {};

  it("accepts an ordered complete cache from the current immutable document", () => {
    expect(currentDocumentLocationPairs(identities, [
      { identity: "first", doc: currentDoc, location: locations[0]! },
      { identity: "second", doc: currentDoc, location: locations[1]! },
    ], currentDoc)?.map(({ identity, location }) => [identity, location.filename])).toEqual([
      ["first", "first.png"],
      ["second", "second.png"],
    ]);
  });

  it("rejects missing, stale, reordered and duplicate cache identities", () => {
    expect(currentDocumentLocationPairs(identities, [
      { identity: "first", doc: currentDoc, location: locations[0]! },
      null,
    ], currentDoc)).toBeNull();
    expect(currentDocumentLocationPairs(identities, [
      { identity: "first", doc: {}, location: locations[0]! },
      { identity: "second", doc: currentDoc, location: locations[1]! },
    ], currentDoc)).toBeNull();
    expect(currentDocumentLocationPairs(identities, [
      { identity: "second", doc: currentDoc, location: locations[1]! },
      { identity: "first", doc: currentDoc, location: locations[0]! },
    ], currentDoc)).toBeNull();
    expect(currentDocumentLocationPairs(["first", "first"], [
      { identity: "first", doc: currentDoc, location: locations[0]! },
      { identity: "first", doc: currentDoc, location: locations[1]! },
    ], currentDoc)).toBeNull();
  });

  it("rejects one source address cached for distinct identities", () => {
    expect(currentDocumentLocationPairs(identities, [
      { identity: "first", doc: currentDoc, location: locations[0]! },
      { identity: "second", doc: currentDoc, location: locations[0]! },
    ], currentDoc)).toBeNull();
  });

  it("rejects source locations that move backward in DOM order", () => {
    expect(currentDocumentLocationPairs(identities, [
      { identity: "first", doc: currentDoc, location: locations[1]! },
      { identity: "second", doc: currentDoc, location: locations[0]! },
    ], currentDoc)).toBeNull();
  });
});

describe("isImageEmbedNodeName", () => {
  it("accepts decorated Obsidian image fragments shared by LP and the resolver", () => {
    expect(isImageEmbedNodeName("formatting_image-marker")).toBe(true);
    expect(isImageEmbedNodeName("HyperMD-formatting-embed")).toBe(true);
  });

  it("rejects unrelated syntax nodes", () => {
    expect(isImageEmbedNodeName("hmd-codeblock")).toBe(false);
    expect(isImageEmbedNodeName("link-marker")).toBe(false);
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
    expect(all.map((e) => e.filename)).toEqual(["one.png", "two.png", "three.png"]);
    expect(all.map((e) => e.line)).toEqual([0, 2, 2]);
  });

  it("flags which embeds carry a {…} transform block (params !== '')", () => {
    const edited = allEmbedsInText(src).filter((e) => e.params !== "");
    expect(edited.map((e) => e.filename)).toEqual(["one.png", "two.png"]);
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

// basename — a `#`/`^` resolution subpath belongs to resolution, not the filename (Bug 120):
// `img.png#heading` must still match a rendered `img.png`.
describe("basename — strips a #/^ subpath before comparing (Bug 120)", () => {
  it("strips a # heading subpath", () => {
    expect(basename("img.png#heading")).toBe("img.png");
  });

  it("strips a ^ block-ref subpath", () => {
    expect(basename("folder/img.png^blockref")).toBe("img.png");
  });

  it("a wiki embed with a #subpath still resolves by basename", () => {
    const loc = findImageInLine("![[img.png#heading]]{rotate=90}", 0, "img.png");
    expect(loc?.params).toBe("rotate=90");
    expect(loc?.filename).toBe("img.png#heading"); // ImageLocation.filename keeps it as written
  });

  it("a %-encoded md path decodes for the basename comparison", () => {
    expect(basename("images/a%20b.png")).toBe("a b.png");
  });
});
