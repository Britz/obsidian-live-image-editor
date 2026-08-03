import type { Editor } from "obsidian";
import { splitWikiInner, isTableRow, allEmbedsInLine, stripLinkSubpath } from "./link-format";

export interface ImageLocation {
  line: number;
  start: number;    // start of the embed
  headEnd: number;  // end of the embed head (the ]] or ) ), i.e. start of any {…} block
  end: number;      // end of the embed incl. a trailing {…} block
  isWikiLink: boolean;
  filename: string; // path as written in the embed (table-escaped `\|` unescaped)
  /** The exact trailing attribute block including braces, or an empty string. */
  block: string;
  params: string;   // content of the {…} transform block, "" if none
  // The alt/alias the embed carries (table-escaped `\|` unescaped): the Markdown alt
  // (`![ALT](path)`) or the wikilink alias after the first unescaped pipe (`![[path|ALIAS]]`,
  // "" if none). It mixes caption + native `|size`; the caption/size split is caption-logic's
  // job. Surfaced so a "Replace image" swap can preserve it.
  alt: string;
  // The embed sits in a Markdown table row — a writer rebuilding it must escape its pipes.
  inTable: boolean;
}

// Transforms are stored in a trailing {…} attribute block so the link itself —
// caption (markdown alt) and native size (wikilink pipe) — stays untouched:
//   ![caption](path){rotate=90}
//   ![[image.png|300]]{rotate=90}
// Reading the embed itself (both link forms, the table-escaped `\|`, arbitrary-depth balanced
// md-destination parens, …) is link-format's ONE scanner (Bug 120) — this module only maps its
// result onto the DOM/editor-facing `ImageLocation` shape.

// The comparable basename of a written link token (the wikilink inner text or the md path), used to
// match a rendered image against its source embed — and to find every occurrence of the same target
// for "Replace all" (Feature 3). For wikilinks the inner text may carry a |size/|alt suffix, and a
// `#`/`^` subpath belongs to resolution, not the filename (stripped here, ParsedEmbed.path keeps it).
export function basename(path: string): string {
  const file = stripLinkSubpath(splitWikiInner(path).path);
  try {
    return decodeURIComponent(file).split(/[/\\]/).pop() ?? file;
  } catch {
    return file.split(/[/\\]/).pop() ?? file;
  }
}

// Every embed on ONE line, in column order — the building block of the position-exact
// source↔DOM map (AB3), mapped from link-format's scanner onto the ImageLocation shape.
function embedsInLine(line: string, lineNo: number): ImageLocation[] {
  const inTable = isTableRow(line);
  return allEmbedsInLine(line).map((e) => ({
    line: lineNo,
    start: e.start,
    headEnd: e.headEnd,
    end: e.end,
    isWikiLink: e.format === "wiki",
    filename: e.path,
    block: e.block,
    params: e.block ? e.block.slice(1, -1) : "",
    alt: e.alt,
    inTable,
  }));
}

export interface RenderedImageIdentity<T> {
  identity: T;
  source: string;
}

export interface ImageLocationPair<T> {
  identity: T;
  location: ImageLocation;
}

export interface CachedImageLocation<T, D> extends ImageLocationPair<T> {
  doc: D;
}

/** Returns whether a syntax-node name carries an Obsidian image-embed fragment. */
export function isImageEmbedNodeName(name: string): boolean {
  return name.includes("image-marker") || name.includes("formatting-embed");
}

/** Returns source locations inside an inclusive line range. */
export function locationsInLineRange(
  locations: readonly ImageLocation[],
  lineStart: number,
  lineEnd: number
): ImageLocation[] | null {
  if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd) || lineStart < 0 || lineEnd < lineStart) return null;
  const bounded: ImageLocation[] = [];
  for (const location of locations) {
    if (!Number.isInteger(location.line) || location.line < 0) return null;
    if (location.line >= lineStart && location.line <= lineEnd) bounded.push(location);
  }
  return bounded;
}

/** Returns a unique source-ordered cache for the current document. */
export function currentDocumentLocationPairs<T, D>(
  identities: readonly T[],
  cached: readonly (CachedImageLocation<T, D> | null | undefined)[],
  currentDoc: D
): ImageLocationPair<T>[] | null {
  if (identities.length !== cached.length) return null;
  const seen = new Set<T>();
  const locations = new Set<string>();
  let previous: ImageLocation | null = null;
  const pairs: ImageLocationPair<T>[] = [];
  for (let i = 0; i < identities.length; i++) {
    const identity = identities[i]!;
    const entry = cached[i];
    if (!entry || entry.identity !== identity || entry.doc !== currentDoc || seen.has(identity)) return null;
    const location = entry.location;
    const key = `${location.line}:${location.start}:${location.headEnd}:${location.end}`;
    if (
      locations.has(key)
      || (previous !== null && (
        location.line < previous.line
        || (location.line === previous.line && location.start <= previous.start)
      ))
    ) return null;
    seen.add(identity);
    locations.add(key);
    previous = location;
    pairs.push({ identity, location });
  }
  return pairs;
}

/**
 * Pairs rendered image identities and source locations in order when their basenames match exactly.
 */
export function pairImageLocations<T>(
  rendered: readonly RenderedImageIdentity<T>[],
  locations: readonly ImageLocation[]
): ImageLocationPair<T>[] | null {
  if (rendered.length !== locations.length) return null;

  const identities = new Set<T>();
  const pairs: ImageLocationPair<T>[] = [];
  for (let i = 0; i < rendered.length; i++) {
    const item = rendered[i]!;
    const location = locations[i]!;
    const renderedName = basename(item.source);
    const locationName = basename(location.filename);
    if (!renderedName || !locationName || identities.has(item.identity) || renderedName !== locationName) return null;
    identities.add(item.identity);
    pairs.push({ identity: item.identity, location });
  }
  return pairs;
}

export function findImageInSource(editor: Editor, img: HTMLImageElement): ImageLocation | null {
  const src = getImageFilename(img);
  if (!src) return null;

  for (let i = 0; i < editor.lineCount(); i++) {
    const loc = findImageInLine(editor.getLine(i), i, src);
    if (loc) return loc;
  }
  return null;
}

// Resolve the `occurrence`-th embed (0 = first) of `src`'s basename across the text, in source
// order — the position-exact READING-VIEW resolver (F2 / AB3). There is no CM6/posAtDOM in
// reading view, so a repeated file is disambiguated by occurrence order: the n-th rendered embed
// of that basename maps to the n-th source embed, not merely the first basename match.
export function findImageInText(text: string, src: string, occurrence = 0): ImageLocation | null {
  const lines = text.split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    for (const loc of embedsInLine(lines[i] ?? "", i)) {
      if (basename(loc.filename) === src && seen++ === occurrence) return loc;
    }
  }
  return null;
}

// Match the embed for `src` on ONE specific line — the disambiguating resolver (Bug 56): the
// caller knows the exact line (from the rendered image's DOM position), so a file embedded more
// than once resolves to the RIGHT occurrence, not merely the first basename match in the note.
export function findImageInLine(line: string, lineNo: number, src: string): ImageLocation | null {
  for (const loc of embedsInLine(line, lineNo)) {
    if (basename(loc.filename) === src) return loc;
  }
  return null;
}

// The first image embed on a line in column order, or null — the command target resolver for the
// command palette / hotkeys, where there is no hover: the image on the editor's CURSOR line.
export function firstEmbedInLine(line: string, lineNo: number): ImageLocation | null {
  return embedsInLine(line, lineNo)[0] ?? null;
}

// Every image embed in the note, in source order — the building block of page-scope commands
// (e.g. "reset all images"), which act on the whole document rather than one image in context.
export function allEmbedsInText(text: string): ImageLocation[] {
  const lines = text.split("\n");
  const out: ImageLocation[] = [];
  for (let i = 0; i < lines.length; i++) out.push(...embedsInLine(lines[i] ?? "", i));
  return out;
}

// The pure core of multi-image selection targeting (0.5.2): the INDICES of `spans` (absolute
// [from,to) document offsets) that overlap ANY of the `ranges` (non-empty selection ranges). Each
// index is returned at most once, in input order. Half-open overlap (`from < hi && to > lo`) so a
// selection that merely abuts an embed's edge (caret right before/after it) does NOT select it.
export function spansOverlappingRanges(
  spans: readonly (readonly [number, number])[],
  ranges: readonly (readonly [number, number])[]
): number[] {
  const out: number[] = [];
  for (let i = 0; i < spans.length; i++) {
    const [from, to] = spans[i]!;
    if (ranges.some(([lo, hi]) => from < hi && to > lo)) out.push(i);
  }
  return out;
}

export function getImageFilename(img: HTMLImageElement): string | null {
  const src = img.getAttribute("src") ?? "";
  if (!src) return null;

  try {
    const url = new URL(src);
    return decodeURIComponent(url.pathname.split("/").pop() ?? "");
  } catch {
    return decodeURIComponent(src.split("/").pop() ?? src);
  }
}
