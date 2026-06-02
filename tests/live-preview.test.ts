import { describe, it, expect } from "vitest";
import { lineDecorations, rewriteWidth, URL_CLASS, URL_BRACE_CLASS, cycleRevealMode } from "../src/live-preview-logic";

describe("cycleRevealMode (F5/D6 — tri-state <> control)", () => {
  it("cycles AUTO -> ON -> OFF -> AUTO", () => {
    expect(cycleRevealMode("auto")).toBe("on");
    expect(cycleRevealMode("on")).toBe("off");
    expect(cycleRevealMode("off")).toBe("auto");
  });
});

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

  it("renders one block widget for an embed+block line in live preview (params = attr content, no braces)", () => {
    expect(lineDecorations(embedBlock, 0, true)).toEqual([
      { kind: "widget", from: 0, to: 15, embed: "![a](b.png)", params: ".x" },
    ]);
  });

  it("offsets the widget by lineFrom", () => {
    const decos = lineDecorations(embedBlock, 100, true);
    expect(decos).toEqual([
      { kind: "widget", from: 100, to: 115, embed: "![a](b.png)", params: ".x" },
    ]);
  });

  it("handles a wikilink embed in live preview", () => {
    expect(lineDecorations("![[img.png|x]]{.y}", 0, true)).toEqual([
      { kind: "widget", from: 0, to: 18, embed: "![[img.png|x]]", params: ".y" },
    ]);
  });

  it("strips braces so standalone classes survive (regression: .lie-left was dropped in live preview)", () => {
    const decos = lineDecorations('![](a.png){.lie-left style="width: 180px;"}', 0, true);
    expect(decos[0]).toMatchObject({ kind: "widget", params: '.lie-left style="width: 180px;"' });
  });

  it("marks the {…} as link syntax in source mode (braces = formatting, inside = url)", () => {
    // start of {…} = 11, end = 15: '{' [11,12], '.x' [12,14], '}' [14,15]
    expect(lineDecorations(embedBlock, 0, false)).toEqual([
      { kind: "mark", from: 11, to: 12, class: URL_BRACE_CLASS },
      { kind: "mark", from: 12, to: 14, class: URL_CLASS },
      { kind: "mark", from: 14, to: 15, class: URL_BRACE_CLASS },
    ]);
  });

  it("omits the empty inner mark for an empty block {}", () => {
    // '![a](b.png){}' → {…} at 11..13: '{' [11,12], '}' [12,13], no inner
    expect(lineDecorations("![a](b.png){}", 0, false)).toEqual([
      { kind: "mark", from: 11, to: 12, class: URL_BRACE_CLASS },
      { kind: "mark", from: 12, to: 13, class: URL_BRACE_CLASS },
    ]);
  });
});

describe("rewriteWidth", () => {
  it("returns null for a line that is not an image embed", () => {
    expect(rewriteWidth("just text", 300)).toBeNull();
  });

  it("creates a {…} block for an embed that has none (resize on a plain image)", () => {
    expect(rewriteWidth("![a](b.png)", 300)).toBe('![a](b.png){style="width: 300px;"}');
  });

  it("adds a width to the {…} block, keeping existing transforms", () => {
    expect(rewriteWidth('![a](b.png){.lie-img style="--lie-rotate: 90deg;"}', 300)).toBe(
      '![a](b.png){.lie-img style="--lie-rotate: 90deg; width: 300px;"}'
    );
  });

  it("replaces an existing width", () => {
    expect(rewriteWidth('![a](b.png){style="width: 100px;"}', 250)).toBe(
      '![a](b.png){style="width: 250px;"}'
    );
  });

  it("keeps snippet classes when writing width", () => {
    expect(rewriteWidth("![a](b.png){.float-right}", 200)).toBe(
      '![a](b.png){.float-right style="width: 200px;"}'
    );
  });
});
