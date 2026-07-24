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
//
// Bug 120 — the ONE grammar source: a hand-written SCANNER (scanEmbed) replaces every embed
// regex in the project. READ accepts everything Obsidian's own parser reads within Markdown
// syntax (verified live against metadataCache) — a wiki inner to the first `]]` (single
// `[`/`]` legal), the table escape layer stripped, an md alt with CommonMark backslash-
// escapes, an md destination bare with arbitrary-depth balanced/escaped parens or as an
// `<…>` angle form, an optional discarded `"…"` title. WRITE emits only Obsidian's canonical
// form (see buildEmbed). See docs/development/implementation-plan.md for the full grammar.

export type LinkFormat = "wiki" | "md";

export interface ParsedEmbed {
  format: LinkFormat;
  caption: string; // caption / alias text (BOTH link forms carry one — Bug 81)
  path: string;    // link target exactly as written (a wiki `#`/`^` subpath included, T12)
  size: string;    // native size token, e.g. "300", "300x200", "autox200" ("" if none)
  alt: string;     // the RAW tail (wiki alias / md alt), escapes resolved, UNSPLIT (caption+size
                    // combined, "" if none) — surfaced for callers that must preserve it verbatim
                    // (e.g. a "Replace image" swap); caption/size above are its split (Bug 81).
  block: string;   // trailing {…} incl. braces ("" if none)
  start: number;   // index of the embed within the line
  headEnd: number; // index just past the embed HEAD (the ]] or the closing )), before any block
  end: number;     // index just past the embed (incl. block)
}

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

// ---- Table-pipe escape ----------------------------------------------------------------
// A Markdown table row adds exactly ONE context rule to inline content: `|` is the CELL
// SEPARATOR, so a pipe belonging to the content is written `\|` (Obsidian's own writing —
// in a wikilink `\|` IS the alias separator, never part of a filename). Read liberally:
// strip the escape layer, then the normal grammar applies. Write conservatively: escape
// every pipe emitted into a table row — a raw `|` would split the cell.

const ESCAPED_PIPE = /\\\|/g;

/** Strip the table escape layer: `\|` → `|`. */
export function unescapeTablePipes(s: string): string {
  return s.replace(ESCAPED_PIPE, "|");
}

/** A pipe-led line — the form Obsidian writes for every Markdown table row. */
export function isTableRow(line: string): boolean {
  return /^\s{0,3}\|/.test(line);
}

/**
 * Split a wikilink inner (`path[|tail]`) at its first pipe, the table escape layer
 * stripped first — the ONE split every consumer of the wiki payload rides.
 */
export function splitWikiInner(inner: string): { path: string; tail: string | null } {
  const clean = unescapeTablePipes(inner);
  const pipe = clean.indexOf("|");
  if (pipe < 0) return { path: clean, tail: null };
  return { path: clean.slice(0, pipe), tail: clean.slice(pipe + 1) };
}

/** Strip a `#`/`^` resolution subpath (first occurrence) off a wiki path — it addresses a
 *  heading/block WITHIN the target, not the filename (`img.png#heading` resolves to img.png);
 *  ParsedEmbed.path itself keeps it as written (T12), only a basename/resolve comparison strips it. */
export function stripLinkSubpath(path: string): string {
  const i = path.search(/[#^]/);
  return i < 0 ? path : path.slice(0, i);
}

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
 * (it stays the derived / responsive value). For each axis the size sets, a same-name
 * `width=`/`height=` key already in the block is REPLACED (the native size wins — never a
 * duplicate key); every other token keeps its place. `block` already carries its braces
 * ("" = none).
 */
function foldSizeIntoBlock(size: string, block: string): string {
  if (!size) return block;
  const [w, h] = size.split("x");
  const adds: string[] = [];
  if (w && w !== "auto" && /^\d+$/.test(w)) adds.push(`width=${w}`);
  if (h && h !== "auto" && /^\d+$/.test(h)) adds.push(`height=${h}`);
  if (adds.length === 0) return block;
  let inner = block ? block.slice(1, -1).trim() : "";
  for (const add of adds) inner = removeKeyToken(inner, add.slice(0, add.indexOf("=")));
  const merged = inner ? `${inner} ${adds.join(" ")}` : adds.join(" ");
  return `{${merged}}`;
}

// A block-inner token: a whitespace-delimited run in which `"…"` / `'…'` quoted segments
// (e.g. a `style="…; …"` value) count as one piece, never split on their inner spaces.
const BLOCK_TOKEN = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;

/** Drop every standalone `key=…` token from a block inner (quote-aware, order kept). */
function removeKeyToken(inner: string, key: string): string {
  const tokens = inner.match(BLOCK_TOKEN) ?? [];
  const kept = tokens.filter((t) => !t.startsWith(`${key}=`));
  return kept.length === tokens.length ? inner : kept.join(" ");
}

// ---- The scanner (Bug 120) — the ONE place that reads an embed off a line -------------------
// A hand-written scanner, not a regex: a wiki inner needs lazy `]]` termination (single `[`/`]`
// legal inside), an md alt needs escape-aware `]` termination, and an md destination needs
// arbitrary-depth PARENTHESIS BALANCE plus an optional discarded `"…"` title — none of which a
// regular expression can express. Every embed-reading call site in the project (link-format
// itself, the resolver, live-preview) rides this one scanner; see implementation-plan.md.

// CommonMark's escapable ASCII punctuation (used both to resolve an md alt's backslash escapes
// on READ and, in reverse, to escape `]`/`[`/`\` back into an alt on WRITE).
const ESCAPABLE = /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g;

/** Resolve CommonMark backslash-escapes (`\]`→`]`, `\\`→`\`, …) in a raw md alt. Also covers the
 *  table-pipe layer (`|` is escapable ASCII punctuation), so no separate pass is needed there. */
function resolveMdEscapes(s: string): string {
  return s.replace(ESCAPABLE, "$1");
}

/** Escape `\`, `[`, `]` back into an md alt on write, so a caption containing them round-trips
 *  (the alt would otherwise terminate early, or mis-nest, on re-read). Backslash FIRST, so a
 *  caption's own literal backslash isn't double-escaped by the bracket passes. */
function escapeMdAlt(caption: string): string {
  return caption.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

// Obsidian's own md-destination percent-encode set (verified against Obsidian's writer): space,
// backslash, and the control characters 0x00/0x08/0x0B/0x0C/0x0E–0x1F. Parentheses and umlauts
// stay RAW. A plain code-point check, not a regex — a literal control-character escape in a
// regex trips the shipped lint's no-control-regex rule (T9: the linter stays exactly as shipped).
function needsMdDestEncode(code: number): boolean {
  return code === 0x20 || code === 0x5c || code === 0x00 || code === 0x08 || code === 0x0b || code === 0x0c
    || (code >= 0x0e && code <= 0x1f);
}

// Idempotent — an already-encoded path has no raw space/backslash/control char left to touch.
function encodeMdDest(path: string): string {
  let out = "";
  for (const ch of path) out += needsMdDestEncode(ch.codePointAt(0) ?? 0) ? encodeURIComponent(ch) : ch;
  return out;
}

/** Find the closing `{…}` block starting exactly at `pos` ("" / unchanged `end` if none —
 *  immediately adjacent only, no gap, matching the link head). */
function scanBlock(line: string, pos: number): { block: string; end: number } {
  if (line[pos] !== "{") return { block: "", end: pos };
  const close = line.indexOf("}", pos + 1);
  if (close === -1) return { block: "", end: pos };
  return { block: line.slice(pos, close + 1), end: close + 1 };
}

/** The first UNESCAPED `]` from `start` (an md alt's terminator) — Obsidian's own alt grammar
 *  runs to the first unescaped `]`, NOT CommonMark's balanced-bracket link text. */
function scanAlt(line: string, start: number): { end: number } | null {
  let k = start;
  while (k < line.length) {
    if (line[k] === "\\" && k + 1 < line.length) { k += 2; continue; }
    if (line[k] === "]") return { end: k };
    k++;
  }
  return null;
}

/** After a destination (bare or angle), consume optional whitespace, an optional discarded
 *  `"…"` CommonMark title, optional whitespace, then require the closing `)` — returning its
 *  index, or null if the tail doesn't balance (unterminated title / no closing paren). */
function finishParen(line: string, from: number): number | null {
  let k = from;
  while (k < line.length && (line[k] === " " || line[k] === "\t")) k++;
  if (line[k] === '"') {
    k++;
    let closed = false;
    while (k < line.length) {
      if (line[k] === "\\" && k + 1 < line.length) { k += 2; continue; }
      if (line[k] === '"') { k++; closed = true; break; }
      k++;
    }
    if (!closed) return null;
    while (k < line.length && (line[k] === " " || line[k] === "\t")) k++;
  }
  return line[k] === ")" ? k : null;
}

/** A bare (non-angle) md destination: arbitrary-depth balanced parentheses, `\(`/`\)` counting as
 *  literal (never open/close). Ends at the first depth-0 `)` or whitespace; unbalanced (runs off
 *  the line without ever reaching depth 0) → null, exactly like Obsidian (not an embed here). */
function scanBareDest(line: string, start: number): { destEnd: number; closeParen: number } | null {
  let depth = 0;
  let k = start;
  while (k < line.length) {
    const c = line[k];
    if (c === "\\" && k + 1 < line.length) { k += 2; continue; }
    if (c === "(") { depth++; k++; continue; }
    if (c === ")") {
      if (depth === 0) break;
      depth--; k++; continue;
    }
    if (depth === 0 && (c === " " || c === "\t")) break;
    k++;
  }
  if (k >= line.length || k === start) return null; // unterminated, or an empty destination
  const closeParen = finishParen(line, k);
  return closeParen === null ? null : { destEnd: k, closeParen };
}

/** The `<…>` angle destination form: runs to the first `>` (may contain spaces). */
function scanAngleDest(line: string, start: number): { destEnd: number; closeParen: number } | null {
  const gt = line.indexOf(">", start);
  if (gt === -1) return null;
  const closeParen = finishParen(line, gt + 1);
  return closeParen === null ? null : { destEnd: gt, closeParen };
}

/** Try a wikilink embed (`![[inner]]{block}?`) anchored exactly at `i`. */
function scanWikiAt(line: string, i: number): ParsedEmbed | null {
  if (line[i + 1] !== "[" || line[i + 2] !== "[") return null;
  const closeIdx = line.indexOf("]]", i + 3); // lazy — first `]]` wins; single `[`/`]` legal inside
  if (closeIdx === -1) return null;
  const inner = line.slice(i + 3, closeIdx);
  const headEnd = closeIdx + 2;
  const { path, tail } = splitWikiInner(inner);
  const alt = tail ?? "";
  const { caption, size } = splitTail(alt);
  const blockScan = scanBlock(line, headEnd);
  return { format: "wiki", caption, path, size, alt, block: blockScan.block, start: i, headEnd, end: blockScan.end };
}

/** Try a markdown embed (`![alt](dest){block}?`) anchored exactly at `i`. */
function scanMdAt(line: string, i: number): ParsedEmbed | null {
  if (line[i + 1] !== "[") return null;
  const altScan = scanAlt(line, i + 2);
  if (!altScan) return null;
  const altRaw = line.slice(i + 2, altScan.end);
  const afterAlt = altScan.end + 1;
  if (line[afterAlt] !== "(") return null;

  let destStart = afterAlt + 1;
  while (line[destStart] === " " || line[destStart] === "\t") destStart++;

  let pathRaw: string;
  let closeParen: number;
  if (line[destStart] === "<") {
    const r = scanAngleDest(line, destStart + 1);
    if (!r) return null;
    pathRaw = line.slice(destStart + 1, r.destEnd);
    closeParen = r.closeParen;
  } else {
    const r = scanBareDest(line, destStart);
    if (!r) return null;
    pathRaw = line.slice(destStart, r.destEnd);
    closeParen = r.closeParen;
  }

  const headEnd = closeParen + 1;
  const alt = resolveMdEscapes(altRaw);
  const { caption, size } = splitTail(alt);
  const blockScan = scanBlock(line, headEnd);
  return { format: "md", caption, path: pathRaw, size, alt, block: blockScan.block, start: i, headEnd, end: blockScan.end };
}

/**
 * Scan `line` for the next embed at or after `from` — the ONE core reader (Bug 120). Tries a
 * wikilink then a markdown embed at each `!`, left to right, so "whichever appears first" falls
 * out of the scan order itself (no separate index comparison needed).
 */
export function scanEmbed(line: string, from = 0): ParsedEmbed | null {
  let i = line.indexOf("!", from);
  while (i !== -1) {
    const found = scanWikiAt(line, i) ?? scanMdAt(line, i);
    if (found) return found;
    i = line.indexOf("!", i + 1);
  }
  return null;
}

/** The first embed on a line, or null. */
export function parseEmbedLine(line: string): ParsedEmbed | null {
  return scanEmbed(line, 0);
}

/** Every embed on a line, in column (source) order. */
export function allEmbedsInLine(line: string): ParsedEmbed[] {
  const out: ParsedEmbed[] = [];
  let e = scanEmbed(line, 0);
  while (e) {
    out.push(e);
    e = scanEmbed(line, e.end);
  }
  return out;
}

/**
 * Render an embed in the target format, preserving caption + size + block. The caption goes
 * in the natural slot of each form (the wiki alias / the markdown alt); a native size is
 * folded into the portable `{…}` block (NEVER the pipe — Bug 81/T2). A caption that contains
 * whitespace or a size-like token is quote-delimited so it round-trips unambiguously.
 *
 * WRITE emits only Obsidian's canonical form (Bug 120): an md destination is percent-encoded
 * exactly Obsidian's own set (space/backslash/control — parens and umlauts stay raw, idempotent
 * on an already-encoded path), the `<…>` angle form is never newly produced, and an md alt
 * escapes `\`/`[`/`]` so it round-trips. Caller contract: a WIKI caption/alias must never
 * contain `]]` — a wikilink has no escape for its own terminator; the ordered-edit writers
 * route through `canonicalTarget`, which keeps the source form for such a caption (never lose
 * the link), and a wiki-sourced caption can never itself contain `]]` (reading one would
 * already have cut the inner short at the first occurrence, Bug 120).
 */
export function buildEmbed(
  format: LinkFormat,
  parts: { caption: string; path: string; size: string; block: string; escapePipe?: boolean }
): string {
  const { caption, size } = parts;
  const block = foldSizeIntoBlock(size, parts.block);
  let embed: string;
  if (format === "wiki") {
    const alias = delimitCaption(caption);
    embed = `![[${alias ? `${parts.path}|${alias}` : parts.path}]]${block}`;
  } else {
    const path = encodeMdDest(parts.path);
    const alias = delimitCaption(escapeMdAlt(caption));
    embed = `![${alias}](${path})${block}`;
  }
  // Into a table row EVERY literal pipe goes out escaped — a raw `|` splits the cell.
  return parts.escapePipe ? embed.replace(/\|/g, "\\|") : embed;
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

/** Path token from a `generateMarkdownLink` result (a plain link, normalized to embed shape and
 *  parsed by the one scanner); null when it does not parse as `desired`. */
export function pathFromGeneratedLink(link: string, desired: LinkFormat): string | null {
  const e = parseEmbedLine(link.startsWith("!") ? link : `!${link}`);
  return e && e.format === desired && e.start === 0 ? e.path : null;
}

/** Form + path an ordered edit writes: `desired` with the verified `token`; the source form and
 *  path when no token exists or a wiki alias would have to carry `]]`. */
export function canonicalTarget(
  source: LinkFormat, sourcePathToken: string, desired: LinkFormat, caption: string, token: string | null
): { format: LinkFormat; path: string } {
  const usable = token !== null && !(desired === "wiki" && caption.includes("]]"));
  return usable ? { format: desired, path: token } : { format: source, path: sourcePathToken };
}

