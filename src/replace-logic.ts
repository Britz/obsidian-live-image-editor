// Pure logic for "Replace image" / "Replace all" (Feature 3): swap the TARGET of an image embed for
// another file while keeping its trailing `{…}` transform block, its caption (markdown alt) and any
// native `|size` intact — the edits survive, the user can Reset. DOM/Obsidian-free so it's unit-
// testable (Lesson 6); the plugin resolves the actual occurrence by DOM position (image-resolver),
// the same way crop/export do — NEVER a basename scan (Bug 33). The link FORM (wikilink vs markdown)
// follows Obsidian's central "Use [[Wikilinks]]" setting, exactly like the rest of the plugin.

import { ImageLocation } from "./image-resolver";
import { splitTail } from "./link-format";

// Split a raw alt/alias string (the markdown alt, or the wikilink alias after the first pipe) into
// its caption text and its native size token. Both come from the SAME string: e.g. `cap 300`
// / `cap|300` → { caption: "cap", size: "300" }, `300` → { caption: "", size: "300" }, `cap` →
// { caption: "cap", size: "" }. The grammar (whitespace- or legacy `|`-separated size, `WxH`/`auto`
// dimensions, `"…"`-delimited caption) is owned by link-format's `splitTail` (Bug 81), reused here
// so Replace, the captions and the link-form conversion all agree.
const splitAlt = splitTail;

/**
 * Build the replacement embed string for ONE occurrence: the new `path` in the desired link form,
 * carrying the existing `{…}` block across. `useWikilinks` picks the form; `newPath` is the link
 * token already formatted for that form (typically from Obsidian's `fileManager.generateMarkdownLink`,
 * stripped to its inner path) — the function does no path encoding itself. The original `caption` and
 * native `size` are PRESERVED on the swap: a replacement is the same subject visually, so its caption
 * still applies. Markdown can carry both as `caption|size`. A WIKILINK carries only ONE suffix (the
 * native alias / size pipe — Obsidian wikilinks have no separate caption+size slot), so the caption is
 * preferred and the size dropped when both are present; with no caption the size is kept verbatim.
 */
export function buildReplacementEmbed(
  newPath: string, block: string, useWikilinks: boolean, size: string, caption = ""
): string {
  if (useWikilinks) {
    // Single-suffix limitation: a wikilink alias is one slot, so prefer the caption, else the size.
    const suffix = caption || size;
    const inner = suffix ? `${newPath}|${suffix}` : newPath;
    return `![[${inner}]]${block}`;
  }
  // Markdown alt can carry both: `caption|size` (caption-only → `caption`, size-only → `|size`).
  const alt = size ? `${caption}|${size}` : caption;
  return `![${alt}](${newPath})${block}`;
}

/**
 * Rewrite the embed at `location` in `source` so it targets `newPath` (already formatted for the
 * chosen link form), keeping its `{…}` block. Returns the full new source text. The original embed's
 * caption and native `|size` are carried across. Only the targeted occurrence is touched — duplicates
 * of the same file elsewhere are left alone (that's what "Replace all" is for).
 */
export function replaceEmbedTarget(
  source: string,
  location: ImageLocation,
  newPath: string,
  useWikilinks: boolean
): string {
  const lines = source.split("\n");
  const line = lines[location.line];
  if (line === undefined) return source;
  const block = location.params ? `{${location.params}}` : "";
  const { caption, size } = splitAlt(location.alt);
  const replacement = buildReplacementEmbed(newPath, block, useWikilinks, size, caption);
  lines[location.line] = line.slice(0, location.start) + replacement + line.slice(location.end);
  return lines.join("\n");
}

// One CodeMirror change spec — absolute document offsets + the text to insert at the embed. The plugin
// turns these into a single isolated transaction (one undo step). `posToOffset` maps {line, ch} to an
// absolute offset.
export interface ReplaceChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * The "Replace all" plan: rewrite EVERY embed in `locations` whose target shares `targetBasename`
 * with the chosen image, each keeping its OWN `{…}` block, caption and native size, all in one edit.
 * The caller supplies the document-order `locations` (every embed in the note — `allEmbedsInText`), a
 * `basenameOf` that extracts the comparable basename from a written link token, and `posToOffset`
 * (from the editor). Returns the change specs; the caller applies them as one transaction. The number
 * of changes is the occurrence count for the user-facing notice.
 */
export function planReplaceAll(
  locations: readonly ImageLocation[],
  targetBasename: string,
  newPath: string,
  useWikilinks: boolean,
  basenameOf: (token: string) => string,
  posToOffset: (line: number, ch: number) => number
): ReplaceChange[] {
  const changes: ReplaceChange[] = [];
  for (const loc of locations) {
    if (basenameOf(loc.filename) !== targetBasename) continue;
    const block = loc.params ? `{${loc.params}}` : "";
    const { caption, size } = splitAlt(loc.alt);
    const insert = buildReplacementEmbed(newPath, block, useWikilinks, size, caption);
    changes.push({
      from: posToOffset(loc.line, loc.start),
      to: posToOffset(loc.line, loc.end),
      insert,
    });
  }
  return changes;
}
