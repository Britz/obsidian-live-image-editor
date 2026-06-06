// Pure logic for converting an image embed between markdown `![](…)` and wikilink
// `![[…]]` form while keeping the trailing `{…}` transform block, the caption and the
// native size intact (F4). DOM/Obsidian-free so it's unit testable (Lesson 6). The actual
// format is dictated by Obsidian's central "Use [[Wikilinks]]" setting; the plugin never
// adds its own toggle.
//
// Bug 81 — both link forms carry BOTH a caption and a native size in the SAME tail (the
// markdown alt, or the wikilink alias after the first pipe). The two are separated by
// whitespace and the caption is delimited by quotes. The native size NEVER travels in the
// wiki pipe across a conversion: on md→wiki / wiki→md the caption becomes the alias / alt
// and the size is folded into the portable `{…}` block (F6/T2 — the size lives in the
// block, never the pipe). See splitTail for the grammar.

export type LinkFormat = "wiki" | "md";

export interface ParsedEmbed {
  format: LinkFormat;
  caption: string; // caption / alias text (BOTH link forms carry one — Bug 81)
  path: string;    // link target exactly as written
  size: string;    // native size token, e.g. "300", "300x200", "autox200" ("" if none)
  block: string;   // trailing {…} incl. braces ("" if none)
  start: number;   // index of the embed within the line
  end: number;     // index just past the embed (incl. block)
}

const WIKI = /!\[\[([^\]]+?)\]\](\{[^}]*\})?/;
const MD = /!\[([^\]]*)\]\(([^)]+)\)(\{[^}]*\})?/;

// A native size token, following the de-facto `obsidian_image_caption` grammar: a bare
// width `<W>`, or `<W>x<H>`, where each dimension is digits OR the keyword `auto`
// (`50`, `50x50`, `autox200`, `50xauto`, `auto`). At least one dimension must be a number
// (a lone `auto` is still a valid token meaning "no constraint").
const DIM = "(?:\\d+|auto)";
const SIZE = new RegExp(`^${DIM}(?:x${DIM})?$`);

// "Use [[Wikilinks]]" ON  → useMarkdownLinks=false → wikilinks.
// "Use [[Wikilinks]]" OFF → useMarkdownLinks=true  → markdown links.
export function desiredFormat(useMarkdownLinks: boolean): LinkFormat {
  return useMarkdownLinks ? "md" : "wiki";
}

const QUOTE = '"';

/**
 * Split a "tail" (the markdown alt, or the wikilink alias text after the first pipe) into a
 * caption and a native size token. The two may COEXIST, whitespace-separated, in either
 * order (`50x50 "Caption"` / `"Caption" 50x50`). The caption is DELIMITED by double quotes;
 * only the FIRST and LAST quote are the delimiters, so quotes inside the caption survive.
 *
 * Grammar (Bug 81):
 *  - A `"…"`-delimited segment is the caption verbatim (quotes stripped). The remaining
 *    non-quoted text, if it is a lone size token, is the size; otherwise it is ignored as
 *    stray text (the explicit caption wins).
 *  - With NO delimiter: split on whitespace; a leading or trailing token that matches the
 *    SIZE grammar is the size, the rest (joined) is the caption. A tail that is ONLY a size
 *    → caption "". A tail with no size token → the whole tail is the caption.
 *  - Legacy back-compat: a trailing native `|<size>` suffix (Obsidian's own
 *    `caption|300` / multi-pipe `caption|300` display) is also peeled as the size.
 */
export function splitTail(tail: string): { caption: string; size: string } {
  let trimmed = tail.trim();
  if (trimmed === "") return { caption: "", size: "" };

  // Legacy native `|<size>` suffix (the pre-Bug-81 form): peel it before everything else.
  let legacySize = "";
  const lastPipe = trimmed.lastIndexOf("|");
  if (lastPipe >= 0) {
    const after = trimmed.slice(lastPipe + 1).trim();
    if (SIZE.test(after)) {
      legacySize = after;
      trimmed = trimmed.slice(0, lastPipe).trim();
      if (trimmed === "") return { caption: "", size: legacySize };
    }
  }

  const first = trimmed.indexOf(QUOTE);
  const last = trimmed.lastIndexOf(QUOTE);
  if (first >= 0 && last > first) {
    // Explicit `"…"` caption: the inside of the outermost quotes, quotes preserved within.
    const caption = trimmed.slice(first + 1, last);
    const outside = (trimmed.slice(0, first) + " " + trimmed.slice(last + 1)).trim();
    return { caption, size: SIZE.test(outside) ? outside : legacySize };
  }

  // No delimiter: a leading or trailing size token peels off, the rest is the caption.
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1 && SIZE.test(parts[0]!)) {
    return { caption: parts.slice(1).join(" "), size: parts[0]! };
  }
  if (parts.length > 1 && SIZE.test(parts[parts.length - 1]!)) {
    return { caption: parts.slice(0, -1).join(" "), size: parts[parts.length - 1]! };
  }
  if (SIZE.test(trimmed)) return { caption: "", size: trimmed };
  return { caption: trimmed, size: legacySize };
}

/**
 * Fold a native size token (`W`, `WxH`, `autox H`, `W xauto`, `auto`) into the trailing
 * `{…}` attribute block as bare `width=`/`height=` keys (F6/T2.3). A numeric dimension
 * becomes a unitless-px key; an `auto` (or absent) dimension emits no key for that axis
 * (it stays the derived / responsive value). `block` already carries its braces ("" = none).
 */
function foldSizeIntoBlock(size: string, block: string): string {
  if (!size) return block;
  const [w, h] = size.split("x");
  const adds: string[] = [];
  if (w && w !== "auto" && /^\d+$/.test(w)) adds.push(`width=${w}`);
  if (h && h !== "auto" && /^\d+$/.test(h)) adds.push(`height=${h}`);
  if (adds.length === 0) return block;
  const inner = block ? block.slice(1, -1).trim() : "";
  const merged = inner ? `${inner} ${adds.join(" ")}` : adds.join(" ");
  return `{${merged}}`;
}

export function parseEmbedLine(line: string): ParsedEmbed | null {
  const wiki = WIKI.exec(line);
  const md = MD.exec(line);
  // Prefer whichever appears first in the line.
  const wikiAt = wiki ? wiki.index : Infinity;
  const mdAt = md ? md.index : Infinity;
  if (wiki && wikiAt <= mdAt) {
    // In a wikilink the text before the first pipe is the PATH; the alias after it carries
    // BOTH a caption and a native size (Bug 81) — split exactly like the markdown alt.
    const inner = wiki[1] ?? "";
    const pipe = inner.indexOf("|");
    const path = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const tail = pipe >= 0 ? inner.slice(pipe + 1) : "";
    const { caption, size } = splitTail(tail);
    return {
      format: "wiki",
      caption,
      path,
      size,
      block: wiki[2] ?? "",
      start: wiki.index,
      end: wiki.index + wiki[0].length,
    };
  }
  if (md) {
    const { caption, size } = splitTail(md[1] ?? "");
    return {
      format: "md",
      caption,
      path: md[2] ?? "",
      size,
      block: md[3] ?? "",
      start: md.index,
      end: md.index + md[0].length,
    };
  }
  return null;
}

/**
 * Render an embed in the target format, preserving caption + size + block. The caption goes
 * in the natural slot of each form (the wiki alias / the markdown alt); a native size is
 * folded into the portable `{…}` block (NEVER the pipe — Bug 81/T2). A caption that contains
 * whitespace or a size-like token is quote-delimited so it round-trips unambiguously.
 */
export function buildEmbed(
  format: LinkFormat,
  parts: { caption: string; path: string; size: string; block: string }
): string {
  const { caption, path, size } = parts;
  const block = foldSizeIntoBlock(size, parts.block);
  const alias = delimitCaption(caption);
  if (format === "wiki") {
    const inner = alias ? `${path}|${alias}` : path;
    return `![[${inner}]]${block}`;
  }
  return `![${alias}](${path})${block}`;
}

/**
 * Delimit a caption for its alt/alias slot so it parses back the same way. A caption needs
 * quotes only when an undelimited token would be mis-read as a size or split on whitespace:
 * i.e. it contains whitespace, or (as a lone token) looks like a size. A simple single-word
 * non-size caption is emitted bare. Returns "" for an empty caption.
 */
function delimitCaption(caption: string): string {
  if (caption === "") return "";
  const needsQuotes = /\s/.test(caption) || SIZE.test(caption) || caption.includes(QUOTE);
  return needsQuotes ? `${QUOTE}${caption}${QUOTE}` : caption;
}

/**
 * Convert the embed on a line to `desired` format, or return null if there is no embed or it
 * is already in the desired format. `pathFor` optionally supplies the correctly-formatted/
 * encoded path token for the target format (from Obsidian's fileManager.generateMarkdownLink);
 * when it returns null the existing path is kept (defensive — never lose the link, T12).
 */
export function convertEmbedLine(
  line: string,
  desired: LinkFormat,
  pathFor?: (path: string) => string | null
): string | null {
  const embed = parseEmbedLine(line);
  if (!embed || embed.format === desired) return null;
  const path = pathFor?.(embed.path) ?? embed.path;
  const replacement = buildEmbed(desired, {
    caption: embed.caption,
    path,
    size: embed.size,
    block: embed.block,
  });
  return line.slice(0, embed.start) + replacement + line.slice(embed.end);
}
