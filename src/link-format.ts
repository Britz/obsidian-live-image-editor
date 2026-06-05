// Pure logic for converting an image embed between markdown `![](…)` and wikilink
// `![[…]]` form while keeping the trailing `{…}` transform block, the caption
// (markdown alt) and the native `|size` intact (F4). DOM/Obsidian-free so it's
// unit testable (Lesson 6). The actual format is dictated by Obsidian's central
// "Use [[Wikilinks]]" setting; the plugin never adds its own toggle.

export type LinkFormat = "wiki" | "md";

export interface ParsedEmbed {
  format: LinkFormat;
  caption: string; // markdown alt text / caption (wikilinks can't carry one)
  path: string;    // link target exactly as written
  size: string;    // native size token, e.g. "300" or "300x200" ("" if none)
  block: string;   // trailing {…} incl. braces ("" if none)
  start: number;   // index of the embed within the line
  end: number;     // index just past the embed (incl. block)
}

const WIKI = /!\[\[([^\]]+?)\]\](\{[^}]*\})?/;
const MD = /!\[([^\]]*)\]\(([^)]+)\)(\{[^}]*\})?/;
const SIZE = /^\d+(x\d+)?$/;

// "Use [[Wikilinks]]" ON  → useMarkdownLinks=false → wikilinks.
// "Use [[Wikilinks]]" OFF → useMarkdownLinks=true  → markdown links.
export function desiredFormat(useMarkdownLinks: boolean): LinkFormat {
  return useMarkdownLinks ? "md" : "wiki";
}

// Split a "tail" piece (the markdown alt or the wikilink pipe text) into a caption
// and a native size token. A purely numeric `300` / `300x200` is a size, anything
// else is a caption.
function splitTail(tail: string): { caption: string; size: string } {
  const pipe = tail.indexOf("|");
  if (pipe >= 0) {
    const head = tail.slice(0, pipe);
    const rest = tail.slice(pipe + 1);
    if (SIZE.test(rest)) return { caption: head, size: rest };
    return { caption: tail, size: "" };
  }
  if (SIZE.test(tail)) return { caption: "", size: tail };
  return { caption: tail, size: "" };
}

export function parseEmbedLine(line: string): ParsedEmbed | null {
  const wiki = WIKI.exec(line);
  const md = MD.exec(line);
  // Prefer whichever appears first in the line.
  const wikiAt = wiki ? wiki.index : Infinity;
  const mdAt = md ? md.index : Infinity;
  if (wiki && wikiAt <= mdAt) {
    // In a wikilink the text before the first pipe is the PATH; the pipe tail is a
    // size (for images) — wikilinks carry no markdown caption.
    const inner = wiki[1] ?? "";
    const pipe = inner.indexOf("|");
    const path = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const tail = pipe >= 0 ? inner.slice(pipe + 1) : "";
    return {
      format: "wiki",
      caption: "",
      path,
      size: SIZE.test(tail) ? tail : "",
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

/** Render an embed in the target format, preserving caption/size/block. */
export function buildEmbed(
  format: LinkFormat,
  parts: { caption: string; path: string; size: string; block: string }
): string {
  const { caption, path, size, block } = parts;
  if (format === "wiki") {
    // Wikilinks carry size via the pipe; a markdown caption has no wikilink slot,
    // so it is dropped — matching Obsidian's own md→wiki conversion.
    const inner = size ? `${path}|${size}` : path;
    return `![[${inner}]]${block}`;
  }
  // Native markdown size lives in the alt as `caption|size`; the pipe stays even
  // with an empty caption (`![|300](path)`).
  const alt = size ? `${caption}|${size}` : caption;
  return `![${alt}](${path})${block}`;
}

/**
 * Convert the embed on a line to `desired` format, or return null if there is no
 * embed or it is already in the desired format. `pathFor` optionally supplies the
 * correctly-formatted/encoded path token for the target format (from Obsidian's
 * fileManager.generateMarkdownLink); when it returns null the existing path is
 * kept (defensive — never lose the link, T12).
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
