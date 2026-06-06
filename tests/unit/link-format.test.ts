import { describe, it, expect } from "vitest";
import {
  parseEmbedLine, buildEmbed, convertEmbedLine, desiredFormat, splitTail,
} from "../../src/link-format";

describe("desiredFormat", () => {
  it("maps the central useMarkdownLinks config to a format", () => {
    expect(desiredFormat(true)).toBe("md");
    expect(desiredFormat(false)).toBe("wiki");
  });
});

describe("splitTail (caption vs native size — Bug 81)", () => {
  it("size-only tail → caption empty", () => {
    expect(splitTail("50x50")).toEqual({ caption: "", size: "50x50" });
    expect(splitTail("100")).toEqual({ caption: "", size: "100" });
  });

  it("caption-only tail → size empty", () => {
    expect(splitTail("A caption")).toEqual({ caption: "A caption", size: "" });
    expect(splitTail("cat")).toEqual({ caption: "cat", size: "" });
  });

  it("size + quoted caption, either order", () => {
    expect(splitTail('50x50 "Look at my caption ma!"')).toEqual({
      caption: "Look at my caption ma!", size: "50x50",
    });
    expect(splitTail('"Look at my caption ma!" 50x50')).toEqual({
      caption: "Look at my caption ma!", size: "50x50",
    });
  });

  it("size + UNQUOTED caption, leading or trailing size token", () => {
    expect(splitTail("100x150 I can caption anything")).toEqual({
      caption: "I can caption anything", size: "100x150",
    });
    expect(splitTail("I can caption anything 100x150")).toEqual({
      caption: "I can caption anything", size: "100x150",
    });
  });

  it("auto sizes (auto, WxautoH, autoxH, WxAuto)", () => {
    expect(splitTail("auto")).toEqual({ caption: "", size: "auto" });
    expect(splitTail("autox200")).toEqual({ caption: "", size: "autox200" });
    expect(splitTail("50xauto")).toEqual({ caption: "", size: "50xauto" });
    expect(splitTail('autox200 "cap"')).toEqual({ caption: "cap", size: "autox200" });
  });

  it("keeps quotes INSIDE the caption (only the outer pair are delimiters)", () => {
    expect(splitTail('50x50 "She said "hi" to me"')).toEqual({
      caption: 'She said "hi" to me', size: "50x50",
    });
  });

  it("a quoted caption that LOOKS like a size is kept as a caption", () => {
    expect(splitTail('"100x150"')).toEqual({ caption: "100x150", size: "" });
  });

  it("legacy native |size suffix still parses (back-compat)", () => {
    expect(splitTail("My caption|300")).toEqual({ caption: "My caption", size: "300" });
    expect(splitTail("My caption|300x200")).toEqual({ caption: "My caption", size: "300x200" });
    expect(splitTail("|300")).toEqual({ caption: "", size: "300" });
    expect(splitTail("300")).toEqual({ caption: "", size: "300" });
  });

  it("a bare pipe inside the caption (no size) survives", () => {
    expect(splitTail("a | b")).toEqual({ caption: "a | b", size: "" });
  });

  it("empty tail → empty caption + size", () => {
    expect(splitTail("")).toEqual({ caption: "", size: "" });
    expect(splitTail("   ")).toEqual({ caption: "", size: "" });
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

  it("parses markdown native size out of the alt (legacy pipe)", () => {
    const e = parseEmbedLine("![caption|300](img/cat.png)");
    expect(e).toMatchObject({ format: "md", caption: "caption", size: "300" });
  });

  it("parses md caption + size (quoted)", () => {
    const e = parseEmbedLine('!["I can caption anything!" 100x150](url)');
    expect(e).toMatchObject({ format: "md", caption: "I can caption anything!", size: "100x150", path: "url" });
  });

  it("parses md size-only and caption-only", () => {
    expect(parseEmbedLine("![100x150](url)")).toMatchObject({ caption: "", size: "100x150" });
    expect(parseEmbedLine("![A caption](url)")).toMatchObject({ caption: "A caption", size: "" });
  });

  it("parses a wikilink embed with size + block", () => {
    const e = parseEmbedLine("![[cat.png|300]]{.lie-img}");
    expect(e).toMatchObject({ format: "wiki", path: "cat.png", caption: "", size: "300", block: "{.lie-img}" });
  });

  it("parses a wikilink with a real alias CAPTION (Bug 81 — no longer dropped)", () => {
    const e = parseEmbedLine("![[cat.png|My nice caption]]");
    expect(e).toMatchObject({ format: "wiki", path: "cat.png", caption: "My nice caption", size: "" });
  });

  it("parses a wikilink with size + quoted caption together", () => {
    const e = parseEmbedLine('![[cat.png|50x50 "Look at my caption ma!"]]');
    expect(e).toMatchObject({ format: "wiki", path: "cat.png", caption: "Look at my caption ma!", size: "50x50" });
  });

  it("returns null for a non-embed line", () => {
    expect(parseEmbedLine("just some text")).toBeNull();
  });
});

describe("buildEmbed — caption in the slot, size folded into the block (Bug 81)", () => {
  it("md -> wiki carries the caption to the alias + folds the size into the block", () => {
    expect(buildEmbed("wiki", { caption: "cat", path: "cat.png", size: "300", block: "{.lie-img}" }))
      .toBe("![[cat.png|cat]]{.lie-img width=300}");
  });

  it("wiki -> md keeps the size in the block (not the alt) and the caption in the alt", () => {
    expect(buildEmbed("md", { caption: "", path: "cat.png", size: "300", block: "{.lie-img}" }))
      .toBe("![](cat.png){.lie-img width=300}");
  });

  it("folds WxH into width + height", () => {
    expect(buildEmbed("md", { caption: "", path: "cat.png", size: "50x80", block: "" }))
      .toBe("![](cat.png){width=50 height=80}");
  });

  it("an auto dimension emits no key for that axis", () => {
    expect(buildEmbed("md", { caption: "", path: "p.png", size: "autox200", block: "" }))
      .toBe("![](p.png){height=200}");
    expect(buildEmbed("md", { caption: "", path: "p.png", size: "50xauto", block: "" }))
      .toBe("![](p.png){width=50}");
    expect(buildEmbed("md", { caption: "", path: "p.png", size: "auto", block: "" }))
      .toBe("![](p.png)");
  });

  it("quote-delimits a caption with whitespace or a size-like token so it round-trips", () => {
    expect(buildEmbed("wiki", { caption: "Look at my caption ma!", path: "p.png", size: "50x50", block: "" }))
      .toBe('![[p.png|"Look at my caption ma!"]]{width=50 height=50}');
    // A bare single-word non-size caption needs no quotes.
    expect(buildEmbed("wiki", { caption: "cat", path: "p.png", size: "", block: "" }))
      .toBe("![[p.png|cat]]");
  });
});

describe("convertEmbedLine", () => {
  it("wiki -> md: caption → alt, size → block (Bug 81)", () => {
    const out = convertEmbedLine('![[cat.png|300]]{style="--lie-rotate: 90deg;"}', "md");
    expect(out).toBe('![](cat.png){style="--lie-rotate: 90deg;" width=300}');
  });

  it("wiki -> md: a real alias caption is PRESERVED (was dropped before)", () => {
    const out = convertEmbedLine('![[cat.png|My caption]]', "md");
    expect(out).toBe('!["My caption"](cat.png)');
  });

  it("wiki -> md: size + caption both survive (caption→alt, size→block)", () => {
    const out = convertEmbedLine('![[cat.png|50x50 "My cap"]]{.rounded}', "md");
    expect(out).toBe('!["My cap"](cat.png){.rounded width=50 height=50}');
  });

  it("md -> wiki: caption → alias, size → block (Bug 81)", () => {
    const out = convertEmbedLine('!["My cap" 300](cat.png){style="--lie-rotate: 90deg;"}', "wiki");
    expect(out).toBe('![[cat.png|"My cap"]]{style="--lie-rotate: 90deg;" width=300}');
  });

  it("md -> wiki: keeps the transform block intact, no caption/size", () => {
    const out = convertEmbedLine('![](cat.png){style="--lie-rotate: 90deg;"}', "wiki");
    expect(out).toBe('![[cat.png]]{style="--lie-rotate: 90deg;"}');
  });

  it("returns null when already in the desired format (no rewrite churn)", () => {
    expect(convertEmbedLine("![](cat.png)", "md")).toBeNull();
    expect(convertEmbedLine("![[cat.png]]", "wiki")).toBeNull();
  });

  it("uses the supplied path token but keeps caption/size/block", () => {
    const out = convertEmbedLine("![[cat.png|300]]{.lie-img}", "md", () => "images/cat.png");
    expect(out).toBe("![](images/cat.png){.lie-img width=300}");
  });

  it("falls back to the original path when the resolver returns null (T12)", () => {
    const out = convertEmbedLine("![[cat.png]]{.lie-img}", "md", () => null);
    expect(out).toBe("![](cat.png){.lie-img}");
  });

  it("preserves surrounding text on the line", () => {
    expect(convertEmbedLine("see ![[cat.png]] here", "md")).toBe("see ![](cat.png) here");
  });
});

describe("round-trips (md → wiki → md preserves caption AND size-in-block) — Bug 81", () => {
  const roundTrip = (line: string): string => {
    const wiki = convertEmbedLine(line, "wiki") ?? line;
    return convertEmbedLine(wiki, "md") ?? wiki;
  };

  it("md caption + size round-trips (size lands in the block, caption preserved)", () => {
    // After the first conversion the native size lives in the block, so the alt no longer
    // carries it; the caption survives verbatim and the width=… block is stable.
    const start = '!["I can caption anything!" 100x150](url)';
    const once = convertEmbedLine(start, "wiki");
    expect(once).toBe('![[url|"I can caption anything!"]]{width=100 height=150}');
    const back = convertEmbedLine(once!, "md");
    expect(back).toBe('!["I can caption anything!"](url){width=100 height=150}');
    // Idempotent thereafter (no more native size to fold).
    expect(roundTrip(back!)).toBe('!["I can caption anything!"](url){width=100 height=150}');
  });

  it("caption-only round-trips unchanged in content", () => {
    const start = "![A caption](url)";
    const wiki = convertEmbedLine(start, "wiki");
    expect(wiki).toBe('![[url|"A caption"]]'); // quoted because it has whitespace
    expect(convertEmbedLine(wiki!, "md")).toBe('!["A caption"](url)');
  });

  it("single-word caption stays bare both ways", () => {
    expect(convertEmbedLine("![cat](url)", "wiki")).toBe("![[url|cat]]");
    expect(convertEmbedLine("![[url|cat]]", "md")).toBe("![cat](url)");
  });
});
