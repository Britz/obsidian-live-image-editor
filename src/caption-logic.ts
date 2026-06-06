// Pure caption-text logic (no DOM / no `obsidian` import) so it's unit-testable
// in vitest (Lesson 6). The DOM rendering lives in caption.ts.
//
// The caption vs native-size split is owned by link-format's `splitTail` (Bug 81) — both
// link forms carry a caption AND a size in the same alt/alias tail, whitespace-separated,
// the caption optionally `"…"`-delimited. Reusing that one parser keeps Replace, the
// captions and the link-form conversion in perfect agreement.

import { splitTail } from "./link-format";

/**
 * The caption text for an image embed: its alt text (Markdown `![CAPTION](path)`)
 * or the wikilink display (`![[path|CAPTION]]`).
 *
 * Obsidian's native size is NOT a caption — `![cap 300](p)` / `![cap|300](p)` → "cap",
 * `![[p|300]]` → "" (size only), `![[p|My caption]]` → "My caption". Returns "" when
 * there's no usable caption.
 */
export function captionMarkdown(embed: string): string {
  const wiki = embed.match(/^!\[\[[^\]|]+(?:\|([^\]]*))?\]\]\s*$/);
  if (wiki) return captionFromAlt(wiki[1] ?? "");
  const md = embed.match(/^!\[([^\]]*)\]\(/);
  if (md) return captionFromAlt(md[1] ?? "");
  return "";
}

/**
 * The caption text from a raw alt string (reading view: Obsidian has already extracted
 * `img.alt` from `![alt](p)` / `![[p|alt]]`). Drops a native size token (whitespace- or
 * legacy `|`-separated, `WxH` / `auto` grammar) and strips the caption's `"…"` delimiters,
 * rejecting a size-only alt — all via link-format's shared tail parser (Bug 81).
 */
export function captionFromAlt(alt: string): string {
  return splitTail(alt ?? "").caption;
}
