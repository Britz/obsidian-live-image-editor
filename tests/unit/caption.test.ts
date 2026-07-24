import { describe, it, expect } from "vitest";
import { captionMarkdown, captionFromAlt, captionFromAltGuarded } from "../../src/caption-logic";

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

  it("extracts a quoted caption alongside a whitespace-separated size (Bug 81)", () => {
    expect(captionMarkdown('!["I can caption anything!" 100x150](cat.png)')).toBe("I can caption anything!");
    expect(captionMarkdown('![[cat.png|50x50 "Look at my caption ma!"]]')).toBe("Look at my caption ma!");
  });

  it("strips a whitespace-separated native size from an unquoted caption (Bug 81)", () => {
    expect(captionMarkdown("![A caption 300](cat.png)")).toBe("A caption");
    expect(captionMarkdown("![[cat.png|A caption 300]]")).toBe("A caption");
  });

  it("rejects an auto / WxH size-only alt as a caption (Bug 81)", () => {
    expect(captionMarkdown("![autox200](cat.png)")).toBe("");
    expect(captionMarkdown("![[cat.png|50xauto]]")).toBe("");
    expect(captionMarkdown("![[cat.png|auto]]")).toBe("");
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

  it("handles the Bug 81 grammar (quoted caption, whitespace size, auto)", () => {
    expect(captionFromAlt('100x150 "I can caption anything!"')).toBe("I can caption anything!");
    expect(captionFromAlt("A photo 640x480")).toBe("A photo");
    expect(captionFromAlt("autox200")).toBe("");
    expect(captionFromAlt("50xauto")).toBe("");
  });
});

describe("captionFromAltGuarded (runtime: rejects alt == the image's own filename)", () => {
  it("returns '' when the caption is exactly the source's basename", () => {
    expect(captionFromAltGuarded("cat.png", "cat.png")).toBe("");
    expect(captionFromAltGuarded("cat.png", "/vault/images/cat.png")).toBe("");
    expect(captionFromAltGuarded("cat.png", "https://example.com/images/cat.png?v=2")).toBe("");
  });
  it("decodes a %20-escaped basename before comparing", () => {
    expect(captionFromAltGuarded("my cat.png", "images/my%20cat.png")).toBe("");
  });
  it("keeps a real caption that merely contains the filename", () => {
    expect(captionFromAltGuarded("cat.png is cute", "cat.png")).toBe("cat.png is cute");
  });
  it("keeps a real caption unrelated to the filename", () => {
    expect(captionFromAltGuarded("A photo of a cat", "cat.png")).toBe("A photo of a cat");
  });
  it("passes through a size-only / empty alt unchanged (still '')", () => {
    expect(captionFromAltGuarded("300", "cat.png")).toBe("");
    expect(captionFromAltGuarded("", "cat.png")).toBe("");
  });
});
