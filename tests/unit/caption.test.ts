import { describe, it, expect } from "vitest";
import { captionMarkdown, captionFromAlt } from "../../src/caption-logic";

describe("captionMarkdown (alt text → caption, from an embed string)", () => {
  it("uses the markdown alt text", () => {
    expect(captionMarkdown("![A photo of a cat](cat.png)")).toBe("A photo of a cat");
  });

  it("keeps inline markdown in the caption", () => {
    expect(captionMarkdown("![A *very* **bold** cat](cat.png)")).toBe("A *very* **bold** cat");
  });

  it("strips a trailing native |size from the markdown alt", () => {
    expect(captionMarkdown("![My caption|300](cat.png)")).toBe("My caption");
    expect(captionMarkdown("![My caption|300x200](cat.png)")).toBe("My caption");
  });

  it("returns empty when the markdown alt is only a size", () => {
    expect(captionMarkdown("![300](cat.png)")).toBe("");
  });

  it("returns empty for a markdown image without alt text", () => {
    expect(captionMarkdown("![](cat.png)")).toBe("");
  });

  it("uses the wikilink display text as caption", () => {
    expect(captionMarkdown("![[cat.png|My caption]]")).toBe("My caption");
  });

  it("returns empty for a wikilink whose display is only a size", () => {
    expect(captionMarkdown("![[cat.png|300]]")).toBe("");
    expect(captionMarkdown("![[cat.png|300x200]]")).toBe("");
  });

  it("returns empty for a wikilink with no display text", () => {
    expect(captionMarkdown("![[cat.png]]")).toBe("");
  });

  it("strips a trailing native |size from a multi-pipe wikilink display (matches reading view)", () => {
    // Regression: the wiki branch kept the trailing size, so live preview showed
    // "My caption|300" while reading view (captionFromAlt) showed "My caption".
    expect(captionMarkdown("![[cat.png|My caption|300]]")).toBe("My caption");
    expect(captionMarkdown("![[cat.png|My caption|300x200]]")).toBe("My caption");
  });

  it("does not treat a pipe inside the caption as a size", () => {
    expect(captionMarkdown("![a | b](cat.png)")).toBe("a | b");
  });
});

describe("captionFromAlt (reading view: img.alt → caption)", () => {
  it("returns the alt text", () => {
    expect(captionFromAlt("A photo")).toBe("A photo");
  });

  it("strips a trailing size token", () => {
    expect(captionFromAlt("A photo|300")).toBe("A photo");
    expect(captionFromAlt("A photo|640x480")).toBe("A photo");
  });

  it("returns empty for a size-only alt", () => {
    expect(captionFromAlt("300")).toBe("");
    expect(captionFromAlt("300x200")).toBe("");
  });

  it("returns empty for empty alt", () => {
    expect(captionFromAlt("")).toBe("");
  });
});
