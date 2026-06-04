import { parseAltText, serializeTransform, setWidthPx, MARKER_CLASS } from "./transforms";

// A line that is exactly an image embed, with an OPTIONAL trailing {…} block —
// so every standalone image gets the widget (toolbar/chrome), block or not.
export const EMBED_LINE = /^(\s*)(!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\])(\{[^}]*\})?\s*$/;

// Token classes Obsidian gives the link URL — so the {…} is highlighted exactly
// like (url) in SOURCE mode: braces are formatting, inside is the url string.
export const URL_CLASS = "cm-string cm-url";
export const URL_BRACE_CLASS = "cm-formatting cm-formatting-link-string cm-string cm-url";

// An image embed that sits INSIDE a line of text (not a standalone image line) — e.g.
// an `lie-inline` icon mid-sentence. These get an inline replace widget; without one
// Obsidian renders its own (full-size) inline image and shows the `{…}` as text.
const INLINE_EMBED = /(!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]+\]\])(\{[^}]*\})?/g;

export interface InlineEmbed { from: number; to: number; embed: string; params: string; }

/**
 * Find image embeds embedded WITHIN a line of text (returns [] for a standalone image
 * line — that path uses the block widget). Pure, unit-testable (T-L6). `params` is the
 * attr content without braces (T-L9).
 */
export function inlineEmbeds(lineText: string, lineFrom: number): InlineEmbed[] {
  if (EMBED_LINE.test(lineText)) return [];
  const out: InlineEmbed[] = [];
  INLINE_EMBED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_EMBED.exec(lineText)) !== null) {
    out.push({
      from: lineFrom + m.index,
      to: lineFrom + m.index + m[0].length,
      embed: m[1] ?? "",
      params: m[2] ? m[2].slice(1, -1) : "",
    });
  }
  return out;
}

export type LineDecoration =
  // `params` is the attr_list CONTENT, WITHOUT the surrounding `{…}` braces (T-L9).
  | { kind: "widget"; from: number; to: number; embed: string; params: string }
  | { kind: "mark"; from: number; to: number; class: string };

/**
 * Pure decoration logic for one editor line (no CM/Obsidian deps, unit testable). In
 * live preview a standalone embed+block line becomes a single widget descriptor (the
 * adapter chooses replace vs overlay by cursor position); in source mode the {…} is
 * marked as link syntax.
 */
export function lineDecorations(lineText: string, lineFrom: number, isLivePreview: boolean): LineDecoration[] {
  const match = EMBED_LINE.exec(lineText);
  if (!match) return [];

  if (isLivePreview) {
    const block = match[3];
    return [{ kind: "widget", from: lineFrom, to: lineFrom + lineText.length, embed: match[2] ?? "", params: block ? block.slice(1, -1) : "" }];
  }

  const block = match[3];
  if (!block) return [];
  const start = lineFrom + (match[1]?.length ?? 0) + (match[2]?.length ?? 0);
  const end = start + block.length;
  const decorations: LineDecoration[] = [{ kind: "mark", from: start, to: start + 1, class: URL_BRACE_CLASS }];
  if (end - 1 > start + 1) decorations.push({ kind: "mark", from: start + 1, to: end - 1, class: URL_CLASS });
  decorations.push({ kind: "mark", from: end - 1, to: end, class: URL_BRACE_CLASS });
  return decorations;
}

/** Rewrite an embed line's {…} block with a new width (used by the resize handle). */
export function rewriteWidth(lineText: string, width: number): string | null {
  const match = EMBED_LINE.exec(lineText);
  if (!match) return null;
  const transform = parseAltText((match[3] ?? "").slice(1, -1));
  setWidthPx(transform, width);
  transform.height = undefined;
  const params = serializeTransform(transform);
  return `${match[1] ?? ""}${match[2] ?? ""}${params ? `{${params}}` : ""}`;
}

// ---------------------------------------------------------------------------
// Normalization (the rendering rework): every embed must carry a `{…}` block so
// Obsidian keeps the line a TEXT line and never block-promotes a bare `![](…)` into
// its own `.cm-content` child (which has no `.cm-line` and swallows our inline widget).
// The marker `{.lie-img}` is the invisible (no CSS), portable hook that achieves this.
// ---------------------------------------------------------------------------

/** The marker-only block appended to a bare embed to keep it a `{…}`-carrying line. */
export const MARKER_BLOCK = `{.${MARKER_CLASS}}`;

/**
 * For a BARE standalone embed line (one that is just `![](…)` / `![[…]]` with NO trailing
 * `{…}` block), the column at which to insert {@link MARKER_BLOCK} — right after the embed.
 * Returns null when the line is not a bare standalone embed (not an embed line at all, or
 * it already carries a `{…}` block). Pure, unit-testable (AD7).
 */
export function bareEmbedMarkerInsert(lineText: string): number | null {
  const m = EMBED_LINE.exec(lineText);
  if (!m || m[3]) return null;
  return (m[1]?.length ?? 0) + (m[2]?.length ?? 0);
}

/**
 * Append the marker block to every bare standalone embed line in a whole document's text
 * (the bulk normalize behind the note / vault commands). Returns the new text, or null if
 * nothing needed changing. Pure, unit-testable (AD7).
 */
export function normalizeMarkersInText(text: string): string | null {
  const lines = text.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const at = bareEmbedMarkerInsert(line);
    if (at !== null) { lines[i] = line.slice(0, at) + MARKER_BLOCK + line.slice(at); changed = true; }
  }
  return changed ? lines.join("\n") : null;
}
