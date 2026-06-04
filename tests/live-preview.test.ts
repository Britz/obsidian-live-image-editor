import { describe, it, expect } from "vitest";
import {
  lineDecorations, inlineEmbeds, rewriteWidth, URL_CLASS, URL_BRACE_CLASS,
  bareEmbedMarkerInsert, normalizeMarkersInText, MARKER_BLOCK,
} from "../src/live-preview-logic";

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

  it("renders one block widget for an embed+block line (params = attr content, no braces — T-L9)", () => {
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

  it("strips braces so standalone classes survive (regression: .lie-left dropped — Bug 17/T-L9)", () => {
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
    expect(rewriteWidth("![a](b.png)", 300)).toBe('![a](b.png){.lie-img style="width: 300px"}');
  });
  it("adds a width to the {…} block, keeping the existing native transform", () => {
    expect(rewriteWidth('![a](b.png){.lie-img style="transform: rotate(90deg)"}', 300)).toBe(
      '![a](b.png){.lie-img style="transform: rotate(90deg); width: 300px"}'
    );
  });
  it("replaces an existing width", () => {
    expect(rewriteWidth('![a](b.png){.lie-img style="width: 100px"}', 250)).toBe(
      '![a](b.png){.lie-img style="width: 250px"}'
    );
  });
  it("keeps snippet classes when writing width", () => {
    expect(rewriteWidth("![a](b.png){.lie-img .rounded}", 200)).toBe(
      '![a](b.png){.lie-img .rounded style="width: 200px"}'
    );
  });
});

describe("normalization marker (the rendering rework — every embed carries {…})", () => {
  it("bareEmbedMarkerInsert: marks a bare markdown / wikilink standalone embed after the embed", () => {
    expect(bareEmbedMarkerInsert("![](images/a.png)")).toBe("![](images/a.png)".length);
    expect(bareEmbedMarkerInsert("![alt](a.png)")).toBe("![alt](a.png)".length);
    expect(bareEmbedMarkerInsert("![[a.png]]")).toBe("![[a.png]]".length);
  });
  it("bareEmbedMarkerInsert: keeps the leading indent (inserts after the embed, not the line start)", () => {
    expect(bareEmbedMarkerInsert("  ![](a.png)")).toBe("  ![](a.png)".length);
  });
  it("bareEmbedMarkerInsert: null when the embed already has a {…} block", () => {
    expect(bareEmbedMarkerInsert("![](a.png){.lie-img}")).toBeNull();
    expect(bareEmbedMarkerInsert('![](a.png){.lie-left style="width: 180px"}')).toBeNull();
  });
  it("bareEmbedMarkerInsert: null for a non-embed line or an inline (mid-text) embed", () => {
    expect(bareEmbedMarkerInsert("just some text")).toBeNull();
    expect(bareEmbedMarkerInsert("text ![](a.png) more")).toBeNull();
  });
  it("normalizeMarkersInText: appends the marker to every bare standalone embed, leaving others", () => {
    const src = [
      "# Note",
      "![](a.png)",
      "already ![](b.png){.lie-img} normalized",   // inline w/ block — untouched
      "![[c.png]]",
      "![](d.png){.lie-left}",                       // standalone w/ block — untouched
    ].join("\n");
    expect(normalizeMarkersInText(src)).toBe([
      "# Note",
      `![](a.png)${MARKER_BLOCK}`,
      "already ![](b.png){.lie-img} normalized",
      `![[c.png]]${MARKER_BLOCK}`,
      "![](d.png){.lie-left}",
    ].join("\n"));
  });
  it("normalizeMarkersInText: returns null when there is nothing bare to normalize", () => {
    expect(normalizeMarkersInText("# Note\n![](a.png){.lie-img}\ntext")).toBeNull();
  });
});
