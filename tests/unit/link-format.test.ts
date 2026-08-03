import { describe, it, expect } from "vitest";
import {
  parseEmbedLine, buildEmbed, canonicalTarget, desiredFormat, splitTail, splitWikiInner, isTableRow,
  scanAttributeBlock, scanEmbed, allEmbedsInLine, stripLinkSubpath, pathFromGeneratedLink, LinkFormat,
} from "../../src/link-format";

// The ordered-edit writer pipeline (F5): parse → canonicalTarget → buildEmbed — exactly what
// writeTransform / rewriteWidth ride. The passive line converter was REMOVED (F27); these tests
// keep the grammar coverage on the pipeline itself.
const canonicalRewrite = (
  line: string, desired: LinkFormat, pathFor: (p: string) => string | null = (p) => p
): string => {
  const e = parseEmbedLine(line)!;
  const target = canonicalTarget(e.format, e.path, desired, e.caption, pathFor(e.path));
  const embed = buildEmbed(target.format, {
    caption: e.caption, path: target.path, size: e.size, block: e.block, escapePipe: isTableRow(line),
  });
  return line.slice(0, e.start) + embed + line.slice(e.end);
};

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

describe("scanAttributeBlock", () => {
  it("returns exact wiki and markdown blocks with quoted closing braces", () => {
    const wiki = '![[a.png]]{style="filter: url(}x)" rotate=90} tail';
    const md = "![b](b.png){data='a}b' width=20} tail";
    const wikiPos = wiki.indexOf("{");
    const mdPos = md.indexOf("{");

    expect(scanAttributeBlock(wiki, wikiPos)).toEqual({
      block: '{style="filter: url(}x)" rotate=90}',
      inner: 'style="filter: url(}x)" rotate=90',
      end: wiki.indexOf(" tail"),
    });
    expect(scanAttributeBlock(md, mdPos)).toEqual({
      block: "{data='a}b' width=20}",
      inner: "data='a}b' width=20",
      end: md.indexOf(" tail"),
    });
  });

  it("honours escaped quotes, backslashes and braces", () => {
    const text = String.raw`pre{style="a\"}b\\c" data=a\}b}post`;
    const pos = text.indexOf("{");
    const result = scanAttributeBlock(text, pos);

    expect(result?.block).toBe(String.raw`{style="a\"}b\\c" data=a\}b}`);
    expect(result?.inner).toBe(String.raw`style="a\"}b\\c" data=a\}b`);
    expect(result?.end).toBe(text.indexOf("post"));
  });

  it("returns null for a missing, unterminated or unterminated-quote block", () => {
    expect(scanAttributeBlock("plain", 0)).toBeNull();
    expect(scanAttributeBlock("{width=20", 0)).toBeNull();
    expect(scanAttributeBlock('{style="x} width=20}', 0)).toBeNull();
  });

  it("keeps exact offsets for same-line duplicate embeds", () => {
    const line = `![[a.png]]{style="x:}"} and ![](b.png){style='y:}'}`;
    const embeds = allEmbedsInLine(line);

    expect(embeds.map((embed) => embed.block)).toEqual([
      '{style="x:}"}',
      "{style='y:}'}",
    ]);
    expect(embeds.map((embed) => line.slice(embed.headEnd, embed.end))).toEqual(
      embeds.map((embed) => embed.block)
    );
    expect(embeds[1]!.start).toBe(line.indexOf("![]"));
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

  it("a width= key already in the block is REPLACED — the native size wins, no duplicate", () => {
    expect(buildEmbed("md", { caption: "a", path: "p", size: "513", block: "{width=200}" }))
      .toBe("![a](p){width=513}");
  });

  it("a height= key already in the block is REPLACED the same way", () => {
    expect(buildEmbed("md", { caption: "", path: "p", size: "50x80", block: "{width=1 height=2}" }))
      .toBe("![](p){width=50 height=80}");
  });

  it("replacing a conflicting key leaves foreign tokens intact and in order", () => {
    expect(buildEmbed("md", { caption: "", path: "p", size: "513", block: '{.rounded width=200 style="--x: 1; width: 2px" rotate=90}' }))
      .toBe('![](p){.rounded style="--x: 1; width: 2px" rotate=90 width=513}');
  });
});

describe("the ordered-edit writer pipeline (canonicalTarget + buildEmbed — F5)", () => {
  it("folding the native size replaces a conflicting width= already in the block", () => {
    expect(canonicalRewrite("![[p.png|513]]{width=200}", "md")).toBe("![](p.png){width=513}");
  });

  it("wiki -> md: caption → alt, size → block (Bug 81)", () => {
    expect(canonicalRewrite('![[cat.png|300]]{style="--lie-rotate: 90deg;"}', "md"))
      .toBe('![](cat.png){style="--lie-rotate: 90deg;" width=300}');
  });

  it("wiki -> md: a real alias caption is PRESERVED", () => {
    expect(canonicalRewrite("![[cat.png|My caption]]", "md")).toBe('!["My caption"](cat.png)');
  });

  it("wiki -> md: size + caption both survive (caption→alt, size→block)", () => {
    expect(canonicalRewrite('![[cat.png|50x50 "My cap"]]{.rounded}', "md"))
      .toBe('!["My cap"](cat.png){.rounded width=50 height=50}');
  });

  it("md -> wiki: caption → alias, size → block (Bug 81)", () => {
    expect(canonicalRewrite('!["My cap" 300](cat.png){style="--lie-rotate: 90deg;"}', "wiki"))
      .toBe('![[cat.png|"My cap"]]{style="--lie-rotate: 90deg;" width=300}');
  });

  it("already in the desired format: the rewrite is canonical-idempotent", () => {
    expect(canonicalRewrite("![](cat.png)", "md")).toBe("![](cat.png)");
    expect(canonicalRewrite("![[cat.png]]", "wiki")).toBe("![[cat.png]]");
  });

  it("uses the supplied canonical path token but keeps caption/size/block", () => {
    expect(canonicalRewrite("![[cat.png|300]]{.lie-img}", "md", () => "images/cat.png"))
      .toBe("![](images/cat.png){.lie-img width=300}");
  });

  it("keeps the SOURCE form and path when no token can be produced (never lose the link)", () => {
    expect(canonicalTarget("wiki", "cat.png", "md", "", null)).toEqual({ format: "wiki", path: "cat.png" });
    expect(canonicalTarget("md", "cat.png", "wiki", "", null)).toEqual({ format: "md", path: "cat.png" });
  });

  it("keeps the source form for a `]]`-bearing caption headed into a wiki alias", () => {
    expect(canonicalTarget("md", "cat.png", "wiki", "a]]b", "cat.png")).toEqual({ format: "md", path: "cat.png" });
    expect(canonicalTarget("md", "cat.png", "md", "a]]b", "cat.png")).toEqual({ format: "md", path: "cat.png" });
  });

  it("preserves surrounding text on the line", () => {
    expect(canonicalRewrite("see ![[cat.png]] here", "md")).toBe("see ![](cat.png) here");
  });
});

describe("round-trips (md → wiki → md preserves caption AND size-in-block) — Bug 81", () => {
  it("md caption + size round-trips (size lands in the block, caption preserved)", () => {
    const start = '!["I can caption anything!" 100x150](url)';
    const once = canonicalRewrite(start, "wiki");
    expect(once).toBe('![[url|"I can caption anything!"]]{width=100 height=150}');
    const back = canonicalRewrite(once, "md");
    expect(back).toBe('!["I can caption anything!"](url){width=100 height=150}');
    // Idempotent thereafter (no more native size to fold).
    expect(canonicalRewrite(canonicalRewrite(back, "wiki"), "md")).toBe(back);
  });

  it("caption-only round-trips unchanged in content", () => {
    const wiki = canonicalRewrite("![A caption](url)", "wiki");
    expect(wiki).toBe('![[url|"A caption"]]'); // quoted because it has whitespace
    expect(canonicalRewrite(wiki, "md")).toBe('!["A caption"](url)');
  });

  it("single-word caption stays bare both ways", () => {
    expect(canonicalRewrite("![cat](url)", "wiki")).toBe("![[url|cat]]");
    expect(canonicalRewrite("![[url|cat]]", "md")).toBe("![cat](url)");
  });
});

describe("table-pipe escape (`\\|` grammar — table rows)", () => {
  it("splitWikiInner: splits at the first UNESCAPED pipe, unescapes both halves", () => {
    expect(splitWikiInner("img.png")).toEqual({ path: "img.png", tail: null });
    expect(splitWikiInner("img.png|90")).toEqual({ path: "img.png", tail: "90" });
    expect(splitWikiInner("img.png\\|90")).toEqual({ path: "img.png", tail: "90" });
    expect(splitWikiInner('img.png\\|"a\\|b" 90')).toEqual({ path: "img.png", tail: '"a|b" 90' });
  });

  it("isTableRow: pipe-led lines only", () => {
    expect(isTableRow("| a | b |")).toBe(true);
    expect(isTableRow("  | a |")).toBe(true);
    expect(isTableRow("![[img.png|90]]")).toBe(false);
    expect(isTableRow("text | more")).toBe(false);
  });

  it("parseEmbedLine reads a table-escaped wiki size — path stays clean", () => {
    const e = parseEmbedLine("| cell | ![[img.png\\|90]] |");
    expect(e).toMatchObject({ format: "wiki", path: "img.png", size: "90", caption: "" });
  });

  it("parseEmbedLine reads a table-escaped md alt size", () => {
    const e = parseEmbedLine("| cell | ![cap\\|300](img.png) |");
    expect(e).toMatchObject({ format: "md", path: "img.png", size: "300", caption: "cap" });
  });

  it("buildEmbed escapePipe: every emitted pipe goes out escaped", () => {
    expect(buildEmbed("wiki", { caption: "cat", path: "img.png", size: "", block: "", escapePipe: true }))
      .toBe("![[img.png\\|cat]]");
    expect(buildEmbed("wiki", { caption: "cat", path: "img.png", size: "", block: "" }))
      .toBe("![[img.png|cat]]");
  });

  it("the writer pipeline in a table row: never writes a raw pipe into the cell", () => {
    // md → wiki with a caption inside a table row — the alias pipe must come out escaped.
    const row = "| a | ![cat](img.png) | b |";
    expect(canonicalRewrite(row, "wiki")).toBe("| a | ![[img.png\\|cat]] | b |");
    // wiki (escaped size) → md folds the size into the block, link stays intact.
    const sized = "| a | ![[img.png\\|90]] | b |";
    expect(canonicalRewrite(sized, "md")).toBe("| a | ![](img.png){width=90} | b |");
  });
});

describe("the scanner (Bug 120) — read ∩ write grammar", () => {
  describe("wiki: single brackets legal inside the inner, lazy `]]` termination", () => {
    it("a single [ and ] survive inside the wiki path", () => {
      expect(parseEmbedLine("![[a[b].png]]")).toMatchObject({ format: "wiki", path: "a[b].png" });
    });

    it("a single [ and ] survive alongside a |size tail", () => {
      expect(parseEmbedLine("![[a[b].png|90]]")).toMatchObject({ path: "a[b].png", size: "90" });
    });

    it("ends at the FIRST `]]`, leaving trailing text on the line untouched", () => {
      const e = parseEmbedLine("![[x]]y]]");
      expect(e).toMatchObject({ format: "wiki", path: "x", start: 0 });
      expect(e!.end).toBe(6); // "![[x]]" — "y]]" is NOT part of the embed
    });
  });

  describe("a `#`/`^` subpath belongs to resolution, not the filename", () => {
    it("ParsedEmbed.path keeps the subpath as written", () => {
      expect(parseEmbedLine("![[img.png#heading]]")).toMatchObject({ path: "img.png#heading" });
      expect(parseEmbedLine("![[img.png^blockref]]")).toMatchObject({ path: "img.png^blockref" });
    });

    it("stripLinkSubpath strips the first # or ^ occurrence for a basename/resolve comparison", () => {
      expect(stripLinkSubpath("img.png#heading")).toBe("img.png");
      expect(stripLinkSubpath("img.png^blockref")).toBe("img.png");
      expect(stripLinkSubpath("img.png")).toBe("img.png");
    });
  });

  describe("md destination — a title is recognized and discarded", () => {
    it("a trailing quoted title is dropped from the path", () => {
      expect(parseEmbedLine('![cap](img.png "ein titel")')).toMatchObject({ path: "img.png", caption: "cap" });
    });
  });

  describe("md destination — a `%`-encoded path stays as written (decoded only at comparison)", () => {
    it("parseEmbedLine keeps the raw %20 in the stored path", () => {
      expect(parseEmbedLine("![](a%20b.png)")).toMatchObject({ path: "a%20b.png" });
    });
  });

  describe("md destination — arbitrary-depth balanced parentheses", () => {
    it("depth 1: a(1).png stays raw and balanced", () => {
      expect(parseEmbedLine("![](a(1).png)")).toMatchObject({ path: "a(1).png" });
    });

    it("depth 2: a(b(c)).png", () => {
      expect(parseEmbedLine("![](a(b(c)).png)")).toMatchObject({ path: "a(b(c)).png" });
    });

    it("depth 3: d(e(f(g))).png", () => {
      expect(parseEmbedLine("![](d(e(f(g))).png)")).toMatchObject({ path: "d(e(f(g))).png" });
    });

    it("\\(\\)-escaped parens count as literal, never as open/close", () => {
      expect(parseEmbedLine("![](a\\(b\\).png)")).toMatchObject({ path: "a\\(b\\).png" });
    });

    it("UNBALANCED parens → not an embed (exactly like Obsidian)", () => {
      expect(parseEmbedLine("![](a(b.png)")).toBeNull();
    });
  });

  describe("md destination — the `<…>` angle form", () => {
    it("reads a path containing a raw space", () => {
      expect(parseEmbedLine("![alt](<a b.png>)")).toMatchObject({ path: "a b.png", caption: "alt" });
    });

    it("buildEmbed never re-emits the angle form — it percent-encodes the raw space instead", () => {
      const e = parseEmbedLine("![alt](<a b.png>)")!;
      expect(buildEmbed("md", { caption: e.caption, path: e.path, size: e.size, block: e.block }))
        .toBe("![alt](a%20b.png)");
    });
  });

  describe("md alt — `\\]` escape", () => {
    it("an escaped ] survives inside the alt as a literal ]", () => {
      expect(parseEmbedLine("![cap\\]tion](img.png)")).toMatchObject({ caption: "cap]tion" });
    });

    it("round-trips losslessly through buildEmbed", () => {
      const src = "![a\\]b](img.png)";
      const e = parseEmbedLine(src)!;
      expect(e).toMatchObject({ format: "md", path: "img.png", caption: "a]b" });
      expect(buildEmbed("md", { caption: e.caption, path: e.path, size: e.size, block: e.block })).toBe(src);
    });
  });

  describe("scanEmbed / allEmbedsInLine", () => {
    it("scanEmbed finds the next embed at or after `from`", () => {
      const line = "a ![[one.png]] b ![two](2.png)";
      const first = scanEmbed(line, 0)!;
      expect(first.path).toBe("one.png");
      const second = scanEmbed(line, first.end)!;
      expect(second.path).toBe("2.png");
      expect(scanEmbed(line, second.end)).toBeNull();
    });

    it("allEmbedsInLine returns every embed in column order", () => {
      const line = "a ![[one.png]] b ![two](2.png)";
      expect(allEmbedsInLine(line).map((e) => e.path)).toEqual(["one.png", "2.png"]);
    });
  });
});

describe("writer invariant (user decision) — never emit a link the read grammar can't read back", () => {
  it("an md caption containing `]]` (only reachable via escaped brackets — a raw `]]` cuts " +
     "Obsidian's own alt scan short) keeps the md form on a canonical rewrite towards wiki — " +
     "a wiki alias has no escape for its own `]]` terminator", () => {
    const src = "![a\\]\\]b](img.png)";
    expect(parseEmbedLine(src)?.caption).toBe("a]]b"); // sanity: this DOES parse
    expect(canonicalRewrite(src, "wiki")).toBe(src);
  });
});

describe("pathFromGeneratedLink", () => {
  it("extracts an md destination from the generator's plain-link shape (no embed `!`)", () => {
    expect(pathFromGeneratedLink("[](sample-portrait.png)", "md")).toBe("sample-portrait.png");
    expect(pathFromGeneratedLink("[](images/sample-portrait.png)", "md")).toBe("images/sample-portrait.png");
  });

  it("accepts an already embed-shaped result too", () => {
    expect(pathFromGeneratedLink("![](images/cat.png)", "md")).toBe("images/cat.png");
    expect(pathFromGeneratedLink("![[cat.png]]", "wiki")).toBe("cat.png");
  });

  it("keeps a parenthesis-bearing md destination intact (no truncation at the first `)`)", () => {
    expect(pathFromGeneratedLink("[](Screenshot%20(1).png)", "md")).toBe("Screenshot%20(1).png");
    expect(pathFromGeneratedLink("[](pics/Shot%20(v2)%20(final).png)", "md")).toBe("pics/Shot%20(v2)%20(final).png");
  });

  it("extracts a wiki inner with parens", () => {
    expect(pathFromGeneratedLink("[[Note (v2)]]", "wiki")).toBe("Note (v2)");
  });

  it("drops a CommonMark title from the destination", () => {
    expect(pathFromGeneratedLink('[](cat.png "title")', "md")).toBe("cat.png");
  });

  it("returns null on a format mismatch or an unparseable result", () => {
    expect(pathFromGeneratedLink("[[cat.png]]", "md")).toBeNull();
    expect(pathFromGeneratedLink("[](cat.png)", "wiki")).toBeNull();
    expect(pathFromGeneratedLink("not a link", "md")).toBeNull();
    expect(pathFromGeneratedLink("", "md")).toBeNull();
  });
});

describe("the writer pipeline in a table row (path token supplied)", () => {
  it("rewrites inside a table row, folding the escaped-pipe size into the block and re-escaping pipes", () => {
    const row = "| a | ![[cat.png\\|90]] | b |";
    expect(canonicalRewrite(row, "md", () => "cat.png")).toBe("| a | ![](cat.png){width=90} | b |");
  });

  it("keeps the source form and path (still canonical grammar) when the path cannot be verified", () => {
    const row = "| a | ![[missing.png\\|90]] | b |";
    expect(canonicalRewrite(row, "md", () => null)).toBe("| a | ![[missing.png]]{width=90} | b |");
  });
});
