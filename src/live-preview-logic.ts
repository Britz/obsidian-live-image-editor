import { parseAltText, serializeTransform, setWidthPx } from "./transforms";

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
 * line — that path uses the block widget). Pure, unit-testable (Lesson 6). `params` is the
 * attr content without braces (Lesson 9).
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
  // `params` is the attr_list CONTENT, WITHOUT the surrounding `{…}` braces (Lesson 9).
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

// ---- Raw-link reveal/dismiss state machine (F8) — pure, unit-testable (Lesson 6) --------------------
// The CM StateField in `live-preview.ts` owns the transient reveal state; the DECISION over it lives
// here so it can be tested without CodeMirror. `dismissed` holds the line-start positions whose
// source the `<>` toggle has hidden; `hoveredLine` is the line-start of the mouse-hovered image.

/** Line-start positions = keys; the transient reveal state the StateField tracks. */
export interface RevealState {
  dismissed: Set<number>;
  hoveredLine: number | null;
}

/** One transaction's reveal-relevant inputs, lifted out of the CM `Transaction` (pure data). */
export interface RevealEvents {
  /** Doc-change position remap (CM `changes.mapPos`), or null when the doc did not change. */
  remap: ((pos: number) => number) | null;
  /** Line-start positions toggled by the `<>` control this transaction. */
  toggles: number[];
  /** Image hover enter/leave events this transaction (line-start + on/off). */
  hovers: { line: number; on: boolean }[];
  /** The cursor's current line-start (the "active" line that naturally reveals). */
  activeLineFrom: number;
  /** The global default-state setting: true = always-reveal mode (no auto-clear). */
  alwaysShow: boolean;
}

/**
 * Compute the next reveal state from the previous one and a transaction's events. Pure.
 *
 * - `<>` toggles add/remove the line from `dismissed`; hover enter/leave tracks `hoveredLine`.
 * - AUTO-CLEAR (auto mode only): a dismissed line that is NaturalReveal:false — neither the active
 *   (cursor) line nor hovered — resets, so the dismiss clears when you LEAVE the image (not sticky
 *   across visits). A line toggled THIS transaction is exempt: a fresh `<>` dismiss always takes
 *   effect in its own transaction and only auto-clears on a LATER leave/cursor-move. This makes the
 *   "clear on leave, not within a visit" intent hold for EVERY input path (mouse, and the
 *   `:focus-within`/keyboard path where no prior `mouseenter` set `hoveredLine`), instead of relying
 *   on the implicit invariant that the control is only reachable while the image is hovered.
 * - In always mode NaturalReveal is never false, so a dismiss persists until toggled again / reload.
 *
 * Returns the SAME `dismissed` reference when nothing changed it (so the StateField can skip a
 * rebuild) and a NEW one when it did — the lazy-clone contract the caller relies on.
 */
export function reduceReveal(prev: RevealState, ev: RevealEvents): RevealState {
  let dismissed = prev.dismissed;
  let hoveredLine = prev.hoveredLine;
  const mutate = (): void => { if (dismissed === prev.dismissed) dismissed = new Set(dismissed); };

  if (ev.remap) {
    dismissed = new Set<number>();
    for (const pos of prev.dismissed) dismissed.add(ev.remap(pos));
    if (hoveredLine !== null) hoveredLine = ev.remap(hoveredLine);
  }
  for (const line of ev.toggles) {
    mutate();
    if (dismissed.has(line)) dismissed.delete(line); else dismissed.add(line);
  }
  for (const h of ev.hovers) {
    hoveredLine = h.on ? h.line : (hoveredLine === h.line ? null : hoveredLine);
  }
  if (!ev.alwaysShow && dismissed.size) {
    const justToggled = new Set(ev.toggles);
    for (const lineFrom of [...dismissed]) {
      if (justToggled.has(lineFrom)) continue; // a fresh dismiss survives its own transaction
      if (lineFrom !== ev.activeLineFrom && lineFrom !== hoveredLine) { mutate(); dismissed.delete(lineFrom); }
    }
  }
  return { dismissed, hoveredLine };
}
