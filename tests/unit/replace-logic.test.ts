import { describe, it, expect } from "vitest";
import {
  buildReplacementEmbed, replaceEmbedTarget, planReplaceAll,
} from "../../src/replace-logic";
import { findImageInLine, allEmbedsInText, basename } from "../../src/image-resolver";

// Replace now rides link-format's ONE writer (`buildEmbed`) instead of a hand-rolled string, so its
// output matches the SAME canonicalization every other writer already applies (Bug 94 precedent):
// a native size already on the embed folds into the `{…}` block (never re-emitted as a raw pipe
// suffix), and a caption containing whitespace is quote-delimited the same way `convertEmbedLine`
// already does. Expectations below reflect that — see docs/development/implementation-plan.md.

describe("buildReplacementEmbed", () => {
  it("builds a markdown embed with the new path + kept block", () => {
    expect(buildReplacementEmbed("img/new.png", "{rotate=90}", false, ""))
      .toBe("![](img/new.png){rotate=90}");
  });

  it("builds a wikilink embed with the new path + kept block", () => {
    expect(buildReplacementEmbed("img/new.png", "{rotate=90}", true, ""))
      .toBe("![[img/new.png]]{rotate=90}");
  });

  it("folds a native size into the block (canonical writer — Bug 94/F6/T2)", () => {
    expect(buildReplacementEmbed("new.png", "", true, "300")).toBe("![[new.png]]{width=300}");
    expect(buildReplacementEmbed("new.png", "", false, "300")).toBe("![](new.png){width=300}");
  });

  it("KEEPS the caption on a file swap (a replacement is the same subject visually)", () => {
    // The caption still describes the new image, so it is preserved, not dropped — quoted because
    // it contains whitespace (canonical writer, same as convertEmbedLine).
    expect(buildReplacementEmbed("new.png", "{.rounded}", false, "", "My caption"))
      .toBe('!["My caption"](new.png){.rounded}');
  });

  it("keeps the caption and folds the size into the block (markdown)", () => {
    expect(buildReplacementEmbed("new.png", "", false, "300", "My caption"))
      .toBe('!["My caption"](new.png){width=300}');
  });

  it("keeps the caption as the wiki alias and folds the size into the block", () => {
    // A wikilink alias carries the caption; the native size is never folded back into the pipe.
    expect(buildReplacementEmbed("new.png", "", true, "300", "My caption"))
      .toBe('![[new.png|"My caption"]]{width=300}');
    expect(buildReplacementEmbed("new.png", "", true, "", "My caption"))
      .toBe('![[new.png|"My caption"]]');
    expect(buildReplacementEmbed("new.png", "", true, "300", "")).toBe("![[new.png]]{width=300}");
  });

  it("keeps the embed in its EXISTING form when the desired wiki alias cannot hold the caption", () => {
    // A `]]`-bearing caption can only come from an existing markdown embed (a wiki-sourced caption
    // can never itself contain `]]`, Bug 120) — never lose the link: only the path swaps.
    expect(buildReplacementEmbed("new.png", "{rotate=90}", true, "", "cap]]weird"))
      .toBe("![cap\\]\\]weird](new.png){rotate=90}");
  });

  it("escapes a table row's pipes (escapePipe / ImageLocation.inTable)", () => {
    expect(buildReplacementEmbed("new.png", "", true, "", "My cap", true))
      .toBe('![[new.png\\|"My cap"]]');
  });
});

describe("replaceEmbedTarget — single occurrence, block + caption preserved", () => {
  it("swaps the target of a markdown embed, keeping the {…} block AND the caption", () => {
    const src = "intro\n![old caption](img/old.png){rotate=90 width=300}\noutro";
    const loc = findImageInLine(src.split("\n")[1]!, 1, "old.png")!;
    const out = replaceEmbedTarget(src, loc, "img/new.png", false);
    expect(out).toBe('intro\n!["old caption"](img/new.png){rotate=90 width=300}\noutro');
  });

  it("md: keeps the caption and folds the native size into the block (![cap|300] → […]{width=300})", () => {
    const src = "![A cat|300](img/old.png){.rounded}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", false))
      .toBe('!["A cat"](img/new.png){.rounded width=300}');
  });

  it("md: keeps a size-only alt (no caption), folded into the block (![|300] → […]{width=300})", () => {
    const src = "![|300](img/old.png)";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", false)).toBe("![](img/new.png){width=300}");
  });

  it("swaps the target of a wikilink embed, folding the native size into the block", () => {
    const src = "![[img/old.png|300]]{flip=horizontal}";
    const loc = findImageInLine(src, 0, "old.png")!;
    const out = replaceEmbedTarget(src, loc, "img/new.png", true);
    expect(out).toBe("![[img/new.png]]{flip=horizontal width=300}");
  });

  it("wiki: preserves a caption alias (quoted — it contains whitespace)", () => {
    const src = "![[img/old.png|My caption]]{.rounded}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe('![[img/new.png|"My caption"]]{.rounded}');
  });

  it("wiki: a size-only alias folds into the block, the pipe drops", () => {
    const src = "![[img/old.png|300]]";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true)).toBe("![[img/new.png]]{width=300}");
  });

  it("cross-form: carries the caption md → wiki", () => {
    const src = "![A cat](img/old.png){rotate=90}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe('![[img/new.png|"A cat"]]{rotate=90}');
  });

  it("Bug 81 grammar: a wiki alias's size+quoted caption BOTH survive (size folds into the block)", () => {
    const src = '![[img/old.png|50x50 "My caption"]]{.rounded}';
    const loc = findImageInLine(src, 0, "old.png")!;
    // Previously the single-suffix wiki policy silently DROPPED the size when a caption was also
    // present — buildEmbed folds it into the block instead, so nothing is lost.
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe('![[img/new.png|"My caption"]]{.rounded width=50 height=50}');
  });

  it("Bug 81 grammar: carries an `auto` native size md → md (folded into the block)", () => {
    const src = '!["A caption" autox200](img/old.png)';
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", false))
      .toBe('!["A caption"](img/new.png){height=200}');
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

  it("table row: escapes the wiki alias pipe (never a raw `|` splitting the cell)", () => {
    const src = "| ![[img/old.png\\|My cap]] | x |";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(loc.inTable).toBe(true);
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe('| ![[img/new.png\\|"My cap"]] | x |');
  });

  it("keeps the embed in its EXISTING (markdown) form when the desired wiki alias can't hold a `]]` caption", () => {
    const src = "![cap\\]\\]weird](img/old.png){rotate=90}";
    const loc = findImageInLine(src, 0, "old.png")!;
    expect(replaceEmbedTarget(src, loc, "img/new.png", true))
      .toBe("![cap\\]\\]weird](img/new.png){rotate=90}");
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
    // First (wikilink form chosen): the native size folds into its own block.
    expect(changes[0]!.insert).toBe("![[img/new.png]]{rotate=90 width=300}");
    // Third embed (also old.png, md `![old]`): caption "old" carried to the wikilink alias slot
    // (bare — a single-word, non-size caption needs no quoting).
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
    expect(changes[0]!.insert).toBe('!["First cat"](img/new.png){rotate=90}');
    expect(changes[1]!.insert).toBe('!["Second cat"](img/new.png){.rounded width=300}');
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

  it("escapes table-row pipes for every planned change (escapePipe / ImageLocation.inTable)", () => {
    const src = "| ![[img/old.png\\|cap]] | x |\n| ![[img/old.png]] |";
    const changes = planReplaceAll(
      allEmbedsInText(src), "old.png", "img/new.png", true, basename, offsetOf(src),
    );
    expect(changes).toHaveLength(2);
    expect(changes[0]!.insert).toBe("![[img/new.png\\|cap]]");
    expect(changes[1]!.insert).toBe("![[img/new.png]]");
  });
});
