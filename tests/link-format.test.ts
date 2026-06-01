import { describe, it, expect } from "vitest";
import {
  parseEmbedLine, buildEmbed, convertEmbedLine, desiredFormat,
} from "../src/link-format";

describe("desiredFormat", () => {
  it("maps the central useMarkdownLinks config to a format", () => {
    expect(desiredFormat(true)).toBe("md");
    expect(desiredFormat(false)).toBe("wiki");
  });
});

describe("parseEmbedLine", () => {
  it("parses a markdown embed with caption + block", () => {
    const e = parseEmbedLine('![a cat](img/cat.png){.lie-img style="--lie-rotate: 90deg;"}');
    expect(e).toMatchObject({
      format: "md", caption: "a cat", path: "img/cat.png", size: "",
      block: '{.lie-img style="--lie-rotate: 90deg;"}',
    });
  });

  it("parses markdown native size out of the alt", () => {
    const e = parseEmbedLine("![caption|300](img/cat.png)");
    expect(e).toMatchObject({ format: "md", caption: "caption", size: "300" });
  });

  it("parses a wikilink embed with size + block", () => {
    const e = parseEmbedLine("![[cat.png|300]]{.lie-img}");
    expect(e).toMatchObject({ format: "wiki", path: "cat.png", size: "300", block: "{.lie-img}" });
  });

  it("returns null for a non-embed line", () => {
    expect(parseEmbedLine("just some text")).toBeNull();
  });
});

describe("buildEmbed round-trips and preserves the block", () => {
  it("md -> wiki keeps size + block, drops caption (native behavior)", () => {
    expect(buildEmbed("wiki", { caption: "cat", path: "cat.png", size: "300", block: "{.lie-img}" }))
      .toBe("![[cat.png|300]]{.lie-img}");
  });

  it("wiki -> md keeps size in the alt + block", () => {
    expect(buildEmbed("md", { caption: "", path: "cat.png", size: "300", block: "{.lie-img}" }))
      .toBe("![|300](cat.png){.lie-img}");
  });
});

describe("convertEmbedLine", () => {
  it("converts wiki -> md, keeping the transform block intact (F4)", () => {
    const out = convertEmbedLine('![[cat.png|300]]{style="--lie-rotate: 90deg;"}', "md");
    expect(out).toBe('![|300](cat.png){style="--lie-rotate: 90deg;"}');
  });

  it("converts md -> wiki, keeping the transform block intact (F4)", () => {
    const out = convertEmbedLine('![](cat.png){style="--lie-rotate: 90deg;"}', "wiki");
    expect(out).toBe('![[cat.png]]{style="--lie-rotate: 90deg;"}');
  });

  it("returns null when already in the desired format (no rewrite churn)", () => {
    expect(convertEmbedLine("![](cat.png)", "md")).toBeNull();
    expect(convertEmbedLine("![[cat.png]]", "wiki")).toBeNull();
  });

  it("uses the supplied path token but keeps caption/size/block", () => {
    const out = convertEmbedLine("![[cat.png|300]]{.lie-img}", "md", () => "images/cat.png");
    expect(out).toBe("![|300](images/cat.png){.lie-img}");
  });

  it("falls back to the original path when the resolver returns null (T12)", () => {
    const out = convertEmbedLine("![[cat.png]]{.lie-img}", "md", () => null);
    expect(out).toBe("![](cat.png){.lie-img}");
  });

  it("preserves surrounding text on the line", () => {
    expect(convertEmbedLine("see ![[cat.png]] here", "md")).toBe("see ![](cat.png) here");
  });
});
