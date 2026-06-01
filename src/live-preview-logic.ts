import { parseAltText, serializeTransform } from "./transforms";

// A line that is exactly an image embed, with an OPTIONAL trailing {…} block —
// so every standalone image gets the widget (toolbar/chrome), block or not.
export const EMBED_LINE = /^(\s*)(!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\])(\{[^}]*\})?\s*$/;

// Token classes Obsidian gives the link URL — so the {…} is highlighted exactly
// like (url): the braces are formatting, the inside is the url string.
export const URL_CLASS = "cm-string cm-url";
export const URL_BRACE_CLASS = "cm-formatting cm-formatting-link-string cm-string cm-url";

// The `<>` link reveal is a per-image TRI-state, not a plain toggle (F5/D6):
//   AUTO (default) — editor shows/hides with the toolbar (on hover/selection)
//   ON             — editor stays visible once shown
//   OFF            — editor stays hidden
export type RevealMode = "auto" | "on" | "off";

/** Clicking `<>` cycles AUTO → ON → OFF → AUTO. */
export function cycleRevealMode(mode: RevealMode): RevealMode {
  return mode === "auto" ? "on" : mode === "on" ? "off" : "auto";
}

export type LineDecoration =
  | { kind: "widget"; from: number; to: number; embed: string; params: string }
  | { kind: "mark"; from: number; to: number; class: string };

/**
 * Pure decoration logic for one editor line (no CM/Obsidian deps, so it's unit
 * testable). In live preview an embed+block line becomes a single widget; in
 * source mode the {…} is marked as link syntax (braces = formatting, inside = url).
 */
export function lineDecorations(lineText: string, lineFrom: number, isLivePreview: boolean): LineDecoration[] {
  const match = EMBED_LINE.exec(lineText);
  if (!match) return [];

  // Live preview ALWAYS renders the widget (replace), which suppresses Obsidian's
  // native embed — verified via CDP that dropping the widget lets the native image
  // render inline with {} stuck behind it. The <> reveal therefore lives inside the
  // widget (editable raw link above the image), never by falling back to native.
  if (isLivePreview) {
    return [{ kind: "widget", from: lineFrom, to: lineFrom + lineText.length, embed: match[2] ?? "", params: match[3] ?? "" }];
  }

  // Source mode: only mark when there's actually a {…} block.
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
  transform.width = width;
  transform.height = undefined;
  const params = serializeTransform(transform);
  return `${match[1] ?? ""}${match[2] ?? ""}${params ? `{${params}}` : ""}`;
}
