// Pure logic for "Replace image" / "Replace all" (Feature 3 / F26): swap the TARGET of an image
// embed for another file while keeping its trailing `{…}` transform block, its caption and any
// native size intact — the edits survive, the user can Reset. DOM/Obsidian-free so it's unit-
// testable (Lesson 6); the plugin resolves the actual occurrence by DOM position (image-resolver),
// the same way crop/export do — NEVER a basename scan (Bug 33). The link FORM (wikilink vs markdown)
// follows Obsidian's central "Use [[Wikilinks]]" setting, exactly like the rest of the plugin.
//
// The replacement embed is built through link-format's ONE grammar writer (`buildEmbed`, Bug 120)
// rather than a hand-rolled string, so Replace gets the SAME guarantees as every other writer: a
// table row's pipes are escaped (`escapePipe`/`ImageLocation.inTable`), an md destination is
// percent-encoded, an md caption's `\`/`[`/`]` are escaped, and a native size already on the embed
// folds into the `{…}` block — the same normalization an active transform edit already applies
// (Bug 94 precedent, F6/T2: size lives in the block, never re-emitted as a raw pipe suffix). The
// write ⊆ read invariant applies too (never lose the link): a caption the desired form cannot
// represent — a wiki alias containing `]]`, which a wikilink has no escape for — keeps the embed in
// its EXISTING form; only the path swaps.

import { ImageLocation } from "./image-resolver";
import { buildEmbed, LinkFormat, splitTail } from "./link-format";

// Split a raw alt/alias string (the markdown alt, or the wikilink alias after the first pipe) into
// its caption text and its native size token. Both come from the SAME string: e.g. `cap 300`
// / `cap|300` → { caption: "cap", size: "300" }, `300` → { caption: "", size: "300" }, `cap` →
// { caption: "cap", size: "" }. The grammar (whitespace- or legacy `|`-separated size, `WxH`/`auto`
// dimensions, `"…"`-delimited caption) is owned by link-format's `splitTail` (Bug 81), reused here
// so Replace, the captions and the link-form conversion all agree.
const splitAlt = splitTail;

/**
 * Build the replacement embed string for ONE occurrence: the new `path` in the desired link form,
 * carrying the existing `{…}` block, caption and native size across via `buildEmbed` — the ONE
 * grammar writer (never a second hand-rolled serialization, Bug 120). `useWikilinks` picks the
 * desired form UNLESS `caption` contains `]]`: a wikilink alias has no escape for its own `]]`
 * terminator, so that occurrence keeps its current markdown form instead (never lose the link) —
 * this can only happen for a caption read from an existing MARKDOWN embed (a wiki-sourced caption
 * can never itself contain `]]`, Bug 120). `escapePipe` is table-row context (`ImageLocation.inTable`).
 */
export function buildReplacementEmbed(
  newPath: string, block: string, useWikilinks: boolean, size: string, caption = "", escapePipe = false
): string {
  const desired: LinkFormat = useWikilinks ? "wiki" : "md";
  const format: LinkFormat = desired === "wiki" && caption.includes("]]") ? "md" : desired;
  return buildEmbed(format, { caption, path: newPath, size, block, escapePipe });
}

/**
 * Rewrite the embed at `location` in `source` so it targets `newPath` (already formatted for the
 * chosen link form), keeping its `{…}` block. Returns the full new source text. The original embed's
 * caption and native size are carried across (via `buildEmbed`, folding a native size into the block
 * — see the file header). Only the targeted occurrence is touched — duplicates of the same file
 * elsewhere are left alone (that's what "Replace all" is for).
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
  const replacement = buildReplacementEmbed(newPath, block, useWikilinks, size, caption, location.inTable);
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
    const insert = buildReplacementEmbed(newPath, block, useWikilinks, size, caption, loc.inTable);
    changes.push({
      from: posToOffset(loc.line, loc.start),
      to: posToOffset(loc.line, loc.end),
      insert,
    });
  }
  return changes;
}
