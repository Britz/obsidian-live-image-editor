// Pure caption-text logic (no DOM / no `obsidian` import) so it's unit-testable
// in vitest (T-L6). The DOM rendering lives in caption.ts.

// A bare Obsidian size token (the part after a `|`): `300` or `300x200`. Such a
// token is sizing, never caption text, so it's stripped from the caption.
const SIZE_TOKEN = /^\d+(?:x\d+)?$/;

/**
 * The caption text for an image embed: its alt text (Markdown `![CAPTION](path)`)
 * or the wikilink display (`![[path|CAPTION]]`).
 *
 * Obsidian's native `|<size>` is NOT a caption — `![cap|300](p)` → "cap",
 * `![[p|300]]` → "" (size only), `![[p|My caption]]` → "My caption". Returns ""
 * when there's no usable caption.
 */
export function captionMarkdown(embed: string): string {
  const wiki = embed.match(/^!\[\[[^\]|]+(?:\|([^\]]*))?\]\]\s*$/);
  if (wiki) {
    // Reuse the reading-view extraction so both views agree: it strips a trailing
    // native |size token and rejects a size-only display, even for a multi-pipe
    // `![[p|caption|300]]` (where the raw display is "caption|300").
    return captionFromAlt(wiki[1] ?? "");
  }
  const md = embed.match(/^!\[([^\]]*)\]\(/);
  if (md) return captionFromAlt(md[1] ?? "");
  return "";
}

/**
 * The caption text from a raw alt string (reading view: Obsidian has already
 * extracted `img.alt` from `![alt](p)` / `![[p|alt]]`). Drops a trailing native
 * `|<size>` token, and rejects a size-only alt.
 */
export function captionFromAlt(alt: string): string {
  const parts = (alt ?? "").split("|");
  if (parts.length > 1 && SIZE_TOKEN.test((parts[parts.length - 1] ?? "").trim())) parts.pop();
  const text = parts.join("|").trim();
  return SIZE_TOKEN.test(text) ? "" : text;
}
