import { describe, it, expect } from "vitest";
import {
  lineDecorations, inlineEmbeds, rewriteWidth, URL_CLASS, URL_BRACE_CLASS,
} from "../../src/live-preview-logic";

describe("lineDecorations", () => {
  const embedBlock = "![a](b.png){.x}"; // embed (len 11) + block {.x} (len 4)

  it("returns nothing for a non-embed line", () => {
    expect(lineDecorations("just some text", 0, true)).toEqual([]);
    expect(lineDecorations("just some text", 0, false)).toEqual([]);
  });

  it("renders the widget for an embed WITHOUT a block in live preview (params empty)", () => {
    expect(lineDecorations("![a](b.png)", 0, true)).toEqual([
      { kind: "widget", from: 0, to: 11, embed: "![a](b.png)", params: "" },
    ]);
  });

  it("marks nothing for an embed without a block in source mode", () => {
    expect(lineDecorations("![[a.png]]", 0, false)).toEqual([]);
    expect(lineDecorations("![a](b.png)", 0, false)).toEqual([]);
  });

  it("renders one block widget for an embed+block line (params = attr content, no braces — Lesson 9)", () => {
    expect(lineDecorations(embedBlock, 0, true)).toEqual([
      { kind: "widget", from: 0, to: 15, embed: "![a](b.png)", params: ".x" },
    ]);
  });

  it("offsets the widget by lineFrom", () => {
    expect(lineDecorations(embedBlock, 100, true)).toEqual([
      { kind: "widget", from: 100, to: 115, embed: "![a](b.png)", params: ".x" },
    ]);
  });

  it("handles a wikilink embed in live preview", () => {
    expect(lineDecorations("![[img.png|x]]{.y}", 0, true)).toEqual([
      { kind: "widget", from: 0, to: 18, embed: "![[img.png|x]]", params: ".y" },
    ]);
  });

  it("strips braces so standalone classes survive (regression: .lie-left dropped — Bug 24/Lesson 9)", () => {
    const decos = lineDecorations('![](a.png){.lie-left style="width: 180px"}', 0, true);
    expect(decos[0]).toMatchObject({ kind: "widget", params: '.lie-left style="width: 180px"' });
  });

  it("marks the {…} as link syntax in source mode", () => {
    expect(lineDecorations(embedBlock, 0, false)).toEqual([
      { kind: "mark", from: 11, to: 12, class: URL_BRACE_CLASS },
      { kind: "mark", from: 12, to: 14, class: URL_CLASS },
      { kind: "mark", from: 14, to: 15, class: URL_BRACE_CLASS },
    ]);
  });

  it("omits the empty inner mark for an empty block {}", () => {
    expect(lineDecorations("![a](b.png){}", 0, false)).toEqual([
      { kind: "mark", from: 11, to: 12, class: URL_BRACE_CLASS },
      { kind: "mark", from: 12, to: 13, class: URL_BRACE_CLASS },
    ]);
  });
});

describe("inlineEmbeds (mid-text images, e.g. lie-inline) — F17", () => {
  it("returns nothing for a standalone image line (the block widget's job)", () => {
    expect(inlineEmbeds("![a](b.png){.x}", 0)).toEqual([]);
    expect(inlineEmbeds("  ![[a.png]]  ", 0)).toEqual([]);
  });
  it("returns nothing for a line with no image", () => {
    expect(inlineEmbeds("just some text", 0)).toEqual([]);
  });
  it("finds an image embedded in a sentence, params without braces", () => {
    const line = 'text before ![](img.png){.lie-inline style="width: 22px"} text after';
    const got = inlineEmbeds(line, 0);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      embed: "![](img.png)",
      params: '.lie-inline style="width: 22px"',
      from: line.indexOf("!["),
      to: line.indexOf("} text") + 1,
    });
  });
  it("offsets by lineFrom and finds multiple inline embeds", () => {
    const got = inlineEmbeds("a ![](x.png) b ![[y.png]] c", 100);
    expect(got).toHaveLength(2);
    expect(got[0]?.from).toBe(100 + 2);
    expect(got[1]?.embed).toBe("![[y.png]]");
  });
});

describe("rewriteWidth (a resize is a minimal source edit — AD1/D11)", () => {
  it("returns null for a line that is not an image embed", () => {
    expect(rewriteWidth("just text", 300)).toBeNull();
  });
  it("creates a {…} block for an embed that has none (resize on a plain image)", () => {
    expect(rewriteWidth("![a](b.png)", 300)).toBe("![a](b.png){width=300}");
  });
  it("adds a width, re-emitting a legacy orientation as the new bare key (back-compat read, new write)", () => {
    expect(rewriteWidth('![a](b.png){.lie-img style="transform: rotate(90deg)"}', 300)).toBe(
      "![a](b.png){rotate=90 width=300}"
    );
  });
  it("re-emits a legacy alignment class as the bare align= key when writing width", () => {
    expect(rewriteWidth('![a](b.png){.lie-left}', 300)).toBe("![a](b.png){align=left width=300}");
  });
  it("replaces an existing width", () => {
    expect(rewriteWidth('![a](b.png){.lie-img style="width: 100px"}', 250)).toBe(
      "![a](b.png){width=250}"
    );
  });
  it("keeps snippet classes when writing width (legacy marker dropped)", () => {
    expect(rewriteWidth("![a](b.png){.lie-img .rounded}", 200)).toBe(
      "![a](b.png){.rounded width=200}"
    );
  });
});
