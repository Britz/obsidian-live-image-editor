import { describe, it, expect } from "vitest";
import {
  buildReplacementEmbed, replaceEmbedTarget, planReplaceAll,
} from "../../src/replace-logic";
import { findImageInLine, allEmbedsInText, basename } from "../../src/image-resolver";

describe("buildReplacementEmbed", () => {
  it("builds a markdown embed with the new path + kept block", () => {
    expect(buildReplacementEmbed("img/new.png", "{rotate=90}", false, ""))
      .toBe("![](img/new.png){rotate=90}");
  });

  it("builds a wikilink embed with the new path + kept block", () => {
    expect(buildReplacementEmbed("img/new.png", "{rotate=90}", true, ""))
      .toBe("![[img/new.png]]{rotate=90}");
  });

  it("carries the native size across (wikilink |size, markdown |size)", () => {
    expect(buildReplacementEmbed("new.png", "", true, "300")).toBe("![[new.png|300]]");
    expect(buildReplacementEmbed("new.png", "", false, "300")).toBe("![|300](new.png)");
  });

  it("KEEPS the caption on a file swap (a replacement is the same subject visually)", () => {
    // The caption still describes the new image, so it is preserved, not dropped.
    expect(buildReplacementEmbed("new.png", "{.rounded}", false, "", "My caption"))
      .toBe("![My caption](new.png){.rounded}");
  });

  it("keeps caption + size together in markdown (caption|size)", () => {
    expect(buildReplacementEmbed("new.png", "", false, "300", "My caption"))
      .toBe("![My caption|300](new.png)");
  });

  it("prefers the caption over the size for a wikilink (single suffix)", () => {
    // A wikilink alias is ONE slot, so the caption wins and the size is dropped when both are set.
    expect(buildReplacementEmbed("new.png", "", true, "300", "My caption"))
      .toBe("![[new.png|My caption]]");
    // With only a caption it becomes the alias; with only a size the size is kept verbatim.
    expect(buildReplacementEmbed("new.png", "", true, "", "My caption")).toBe("![[new.png|My caption]]");
    expect(buildReplacementEmbed("new.png", "", true, "300", "")).toBe("![[new.png|300]]");
  });
});

describe("replaceEmbedTarget — single occurrence, block + caption preserved", () => {
  it("swaps the target of a markdown embed, keeping the {…} block AND the caption", () => {
    const src = "intro\n![old caption](img/old.png){rotate=90 width=300}\noutro";
    const loc = findImageInLine(src.split("\n")[1]!, 1, "old.png")!;
    const out = replaceEmbedTarget(src, loc, "img/new.png", false);
    expect(out).toBe("intro\n![old caption](img/new.png){rotate=90 width=300}\noutro");
  });

  it("md: keeps caption + native size together (![cap|300] → ![cap|300])", () => {
    const src = "![A cat|300](img/old.png){.rounded}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", false))
      .toBe("![A cat|300](img/new.png){.rounded}");
  });

  it("md: keeps a size-only alt (no caption) (![|300] → ![|300])", () => {
    const src = "![|300](img/old.png)";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", false)).toBe("![|300](img/new.png)");
  });

  it("swaps the target of a wikilink embed, keeping the block + native size", () => {
    const src = "![[img/old.png|300]]{flip=horizontal}";
    const loc = findImageInLine(src, 0, "old.png")!;
    const out = replaceEmbedTarget(src, loc, "img/new.png", true);
    expect(out).toBe("![[img/new.png|300]]{flip=horizontal}");
  });

  it("wiki: preserves a caption alias verbatim (![[old|cap]] → ![[new|cap]])", () => {
    const src = "![[img/old.png|My caption]]{.rounded}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe("![[img/new.png|My caption]]{.rounded}");
  });

  it("wiki: preserves a size alias verbatim (![[old|300]] → ![[new|300]])", () => {
    const src = "![[img/old.png|300]]";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true)).toBe("![[img/new.png|300]]");
  });

  it("cross-form: carries the caption md → wiki", () => {
    const src = "![A cat](img/old.png){rotate=90}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe("![[img/new.png|A cat]]{rotate=90}");
  });

  it("Bug 81 grammar: parses a wiki alias's size+quoted caption (caption preferred for the new alias)", () => {
    const src = '![[img/old.png|50x50 "My caption"]]{.rounded}';
    const loc = findImageInLine(src, 0, "old.png")!;
    // A wikilink alias is one slot, so the caption wins; the new embed keeps its {…} block.
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe("![[img/new.png|My caption]]{.rounded}");
  });

  it("Bug 81 grammar: carries an `auto` native size md → md (caption|size in the alt)", () => {
    const src = '!["A caption" autox200](img/old.png)';
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", false))
      .toBe("![A caption|autox200](img/new.png)");
  });

  it("leaves surrounding text + OTHER embeds on the line untouched", () => {
    const src = "a ![[old.png]]{rotate=90} b ![[old.png]]{flip=vertical} c";
    // Target the SECOND occurrence (column-resolved): only it changes.
    const second = allEmbedsInText(src).filter((e) => basename(e.filename) === "old.png")[1]!;
    const out = replaceEmbedTarget(src, second, "new.png", true);
    expect(out).toBe("a ![[old.png]]{rotate=90} b ![[new.png]]{flip=vertical} c");
  });

  it("respects the link FORM independently of the original (wiki source → md output)", () => {
    const src = "![[old.png]]{rotate=90}";
    const loc = findImageInLine(src, 0, "old.png")!;
    const out = replaceEmbedTarget(src, loc, "new.png", false);
    expect(out).toBe("![](new.png){rotate=90}");
  });

  it("returns the source unchanged when the line index is out of range", () => {
    const src = "![[old.png]]";
    const loc = { ...findImageInLine(src, 0, "old.png")!, line: 99 };
    expect(replaceEmbedTarget(src, loc, "new.png", true)).toBe(src);
  });
});

describe("planReplaceAll — every occurrence of one source, each block + caption kept", () => {
  // A simple offset oracle: absolute offset of {line, ch} in the multi-line source.
  const offsetOf = (src: string) => {
    const lines = src.split("\n");
    return (line: number, ch: number): number => {
      let off = 0;
      for (let i = 0; i < line; i++) off += (lines[i]?.length ?? 0) + 1; // +1 for the "\n"
      return off + ch;
    };
  };

  it("plans a change for EACH occurrence of the same target, keeping each block", () => {
    const src = [
      "![[img/old.png|300]]{rotate=90}",
      "unrelated ![[other.png]]{flip=vertical}",
      "![old](img/old.png){.rounded}",
    ].join("\n");
    const changes = planReplaceAll(
      allEmbedsInText(src), "old.png", "img/new.png", true, basename, offsetOf(src),
    );
    expect(changes).toHaveLength(2);
    // First (wikilink form chosen): keeps size + its own block.
    expect(changes[0]!.insert).toBe("![[img/new.png|300]]{rotate=90}");
    // Third embed (also old.png, md `![old]`): caption "old" carried to the wikilink alias slot.
    expect(changes[1]!.insert).toBe("![[img/new.png|old]]{.rounded}");
  });

  it("each occurrence keeps its OWN caption", () => {
    const src = [
      "![First cat](img/old.png){rotate=90}",
      "![Second cat|300](img/old.png){.rounded}",
    ].join("\n");
    const changes = planReplaceAll(
      allEmbedsInText(src), "old.png", "img/new.png", false, basename, offsetOf(src),
    );
    expect(changes).toHaveLength(2);
    expect(changes[0]!.insert).toBe("![First cat](img/new.png){rotate=90}");
    expect(changes[1]!.insert).toBe("![Second cat|300](img/new.png){.rounded}");
  });

  it("skips embeds whose target is a different file", () => {
    const src = "![[a.png]]{rotate=90}\n![[b.png]]{flip=vertical}";
    const changes = planReplaceAll(
      allEmbedsInText(src), "a.png", "z.png", true, basename, offsetOf(src),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.insert).toBe("![[z.png]]{rotate=90}");
  });

  it("produces from/to offsets that span exactly each matched embed", () => {
    const src = "![[old.png]]{rotate=90} trailing";
    const off = offsetOf(src);
    const changes = planReplaceAll(
      allEmbedsInText(src), "old.png", "new.png", true, basename, off,
    );
    expect(changes).toHaveLength(1);
    const loc = allEmbedsInText(src)[0]!;
    expect(changes[0]!.from).toBe(off(loc.line, loc.start));
    expect(changes[0]!.to).toBe(off(loc.line, loc.end));
  });

  it("emits no changes when no occurrence matches", () => {
    const src = "![[a.png]]{rotate=90}";
    expect(planReplaceAll(allEmbedsInText(src), "missing.png", "z.png", true, basename, offsetOf(src)))
      .toHaveLength(0);
  });
});
