import { parseAltText, serializeTransform, setWidthPx } from "./transforms";
import { allEmbedsInLine, scanEmbed } from "./link-format";

// Token classes Obsidian gives the link URL — so the {…} is highlighted exactly
// like (url) in SOURCE mode: braces are formatting, inside is the url string.
export const URL_CLASS = "cm-string cm-url";
export const URL_BRACE_CLASS = "cm-formatting cm-formatting-link-string cm-string cm-url";

export interface InlineEmbed { from: number; to: number; embed: string; params: string; }

/**
 * A line that is exactly ONE image embed, with an OPTIONAL trailing {…} block and optional
 * surrounding whitespace — so every standalone image gets the widget (toolbar/chrome), block or
 * not. Built on link-format's scanner (Bug 120): the embed must start exactly where the leading
 * whitespace ends, and nothing but whitespace may follow it.
 */
function scanWholeLineEmbed(lineText: string): { lead: string; head: string; block: string } | null {
  const lead = /^\s*/.exec(lineText)![0];
  const e = scanEmbed(lineText, lead.length);
  if (!e || e.start !== lead.length || !/^\s*$/.test(lineText.slice(e.end))) return null;
  return { lead, head: lineText.slice(e.start, e.headEnd), block: e.block };
}

/**
 * Find image embeds embedded WITHIN a line of text (returns [] for a standalone image
 * line — that path uses the block widget). Pure, unit-testable (Lesson 6). `params` is the
 * attr content without braces (Lesson 9).
 */
export function inlineEmbeds(lineText: string, lineFrom: number): InlineEmbed[] {
  if (scanWholeLineEmbed(lineText)) return [];
  return allEmbedsInLine(lineText).map((e) => ({
    from: lineFrom + e.start,
    to: lineFrom + e.end,
    embed: lineText.slice(e.start, e.headEnd),
    params: e.block ? e.block.slice(1, -1) : "",
  }));
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
  if (isLivePreview) {
    // LP: a STANDALONE embed line becomes one widget descriptor (the adapter chooses replace vs overlay).
    const m = scanWholeLineEmbed(lineText);
    if (!m) return [];
    return [{ kind: "widget", from: lineFrom, to: lineFrom + lineText.length, embed: m.head, params: m.block ? m.block.slice(1, -1) : "" }];
  }

  // SOURCE mode: highlight EVERY embed's {…} attr list as link syntax (braces = formatting, inside = url
  // string). Scan the WHOLE line — standalone AND inline — because the whole-line scanWholeLineEmbed
  // would skip an embed that has text/a trailing char around it, leaving its {…} un-highlighted (the
  // inline-source bug). Only an embed that CARRIES a `{…}` (mirrors the old EMBED_WITH_ATTR) is marked.
  const decorations: LineDecoration[] = [];
  for (const e of allEmbedsInLine(lineText)) {
    if (!e.block) continue;
    const start = lineFrom + e.headEnd;
    const end = start + e.block.length;
    decorations.push({ kind: "mark", from: start, to: start + 1, class: URL_BRACE_CLASS });
    if (end - 1 > start + 1) decorations.push({ kind: "mark", from: start + 1, to: end - 1, class: URL_CLASS });
    decorations.push({ kind: "mark", from: end - 1, to: end, class: URL_BRACE_CLASS });
  }
  return decorations;
}

/** Rewrite an embed line's {…} block with a new width (used by the resize handle). */
export function rewriteWidth(lineText: string, width: number): string | null {
  const m = scanWholeLineEmbed(lineText);
  if (!m) return null;
  const transform = parseAltText(m.block.slice(1, -1));
  setWidthPx(transform, width);
  transform.height = undefined;
  const params = serializeTransform(transform);
  return `${m.lead}${m.head}${params ? `{${params}}` : ""}`;
}

// ---- Raw-link reveal/dismiss state machine (F8) — pure, unit-testable (Lesson 6) --------------------
// The CM StateField in `live-preview.ts` owns the transient reveal state; the DECISION over it lives
// here so it can be tested without CodeMirror. `dismissed` holds the line-start positions whose
// source the `<>` toggle has hidden; `hoveredLine` is the line-start of the mouse-hovered image.

// The natural reveal mode for the link source (the global *default raw-link reveal state*, F8/AD11):
// "native" = the source shows ONLY on the active (cursor) line (the default); "auto" = additionally on
// cm-line HOVER of the image's line; "always" = everywhere. The `<>` dismiss is a SEPARATE per-line
// override on top of this — not a fourth mode.
export type RevealMode = "native" | "auto" | "always";

/** The transient reveal state the StateField tracks. `dismissed` keys are EMBED positions (`e.attrEnd`),
 *  so each embed dismisses independently — even two on the same line. */
export interface RevealState {
  dismissed: Set<number>;
  hoveredLine: number | null;
}

/** One transaction's reveal-relevant inputs, lifted out of the CM `Transaction` (pure data). */
export interface RevealEvents {
  /** Doc-change position remap (CM `changes.mapPos`), or null when the doc did not change. */
  remap: ((pos: number) => number) | null;
  /** EMBED positions (`e.attrEnd`) toggled by the `<>` control this transaction — per-embed, NOT per
   *  line, so two embeds on one line dismiss independently. */
  toggles: number[];
  /** Image hover enter/leave events this transaction (line-start + on/off). */
  hovers: { line: number; on: boolean }[];
  /** The cursor's current line-start (the "active" line that naturally reveals in every mode). */
  activeLineFrom: number;
  /** The global default-state setting (native / auto / always) — drives the auto-clear. */
  mode: RevealMode;
  /** Map a dismissed EMBED key to its line-start, so the per-embed auto-clear can ask "is THIS embed's
   *  line the active/hovered one?" (keys are embed positions; the natural reveal is per line). */
  lineOf: (pos: number) => number;
}

/**
 * Compute the next reveal state from the previous one and a transaction's events. Pure.
 *
 * - `<>` toggles add/remove the line from `dismissed`; hover enter/leave tracks `hoveredLine`.
 * - AUTO-CLEAR (native & auto modes): a dismissed line that is NaturalReveal:false resets, so the
 *   dismiss clears when you LEAVE the image (not sticky across visits). "NaturalReveal" follows the
 *   mode: NATIVE → the active (cursor) line only; AUTO → the active line OR the hovered line. (The
 *   broader AD12 ENGAGED pin — keeping a dismiss while a crop / filter / class / sub-menu panel holds
 *   the image — is the reveal-DISPLAY freeze layered on top in the StateField/CSS, CDP-gated, Bug 86;
 *   ENGAGED ⊇ cursor∪hover, so it only ever KEEPS a dismiss longer, never clears one earlier than this.)
 * - A line toggled THIS transaction is exempt: a fresh `<>` dismiss always takes effect in its own
 *   transaction and only auto-clears on a LATER leave/cursor-move — so the intent holds for EVERY input
 *   path (mouse, and the `:focus-within`/keyboard path where no prior `mouseenter` set `hoveredLine`).
 * - In ALWAYS mode NaturalReveal is never false, so a dismiss persists until toggled again / reload.
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
  for (const pos of ev.toggles) {
    mutate();
    if (dismissed.has(pos)) dismissed.delete(pos); else dismissed.add(pos);
  }
  for (const h of ev.hovers) {
    hoveredLine = h.on ? h.line : (hoveredLine === h.line ? null : hoveredLine);
  }
  if (ev.mode !== "always" && dismissed.size) {
    const justToggled = new Set(ev.toggles);
    // Keep a dismiss only where the source naturally reveals for the mode (so it clears on leave). The
    // keys are EMBED positions; `lineOf` maps each to its line to compare against the active/hovered line.
    const naturallyRevealed = (pos: number): boolean =>
      ev.lineOf(pos) === ev.activeLineFrom || (ev.mode === "auto" && ev.lineOf(pos) === hoveredLine);
    for (const pos of [...dismissed]) {
      if (justToggled.has(pos)) continue; // a fresh dismiss survives its own transaction
      if (!naturallyRevealed(pos)) { mutate(); dismissed.delete(pos); }
    }
  }
  return { dismissed, hoveredLine };
}

// ---- AB16b: the WHOLE-link reveal decision (F8/F9, D16/D17) — pure, unit-testable -------------------
// The architectural CORE of the rework: the plugin is the SINGLE AUTHORITY over the link and DRIVES
// the outcome from Obsidian's OWN parse, it does NOT react to the DOM. Given an embed's parse-derived
// spans (is the cursor within the BODY `![](…)` span? within the `{…}` span?) plus the mode / dismiss /
// engaged state, it computes — by construction (D16) — what to render. The StateField turns this into a
// TOP-DOWN line marker class; the CSS keys on it with plain parent→child selectors (no `:has`).

/** One embed's reveal-relevant inputs, all derived by the caller from the parse spans + selection. */
export interface LinkRevealInput {
  /** The global default reveal mode (F8): native = active line only, auto = + hover, always = everywhere. */
  mode: RevealMode;
  /** This image's source is `<>`-dismissed (transient, F8). */
  dismissed: boolean;
  /** The plugin is engaged with this image (AD12) — the reveal is PINNED (does not flip, Bug 86). */
  engaged: boolean;
  /** The cursor/selection is on this embed's line (the "active line"). */
  onLine: boolean;
  /** This embed's line is pointer-hovered (only matters in auto mode). */
  hovered: boolean;
  /** The selection intersects the parse-given BODY span (`![](…)` / `![[…]]`) — Obsidian's own reveal condition. */
  cursorInBody: boolean;
  /** The selection intersects the `{…}` attribute span. */
  cursorInAttr: boolean;
}

/** What to render for the whole link. The body shows as EITHER the native raw link OR the stand-in. */
export interface LinkRevealState {
  /** Paint the plugin's display-only stand-in (fake) raw link (AB16a). */
  showStandIn: boolean;
  /** RESERVE the stand-in's source box (width+height) even while hidden, as an invisible placeholder, so
   *  the image never reflows when the reveal toggles. False ONLY when the native carries the body
   *  (`cursorInBody`) — then it must collapse, else the box is reserved twice (native + stand-in) and the
   *  line over-flows/wraps. `showStandIn ⇒ reserveStandIn` (a shown stand-in is reserved+visible). */
  reserveStandIn: boolean;
  /** Show the `{…}` attribute list (always in lock-step with the body — D17). */
  showAttr: boolean;
  /** Actively suppress Obsidian's OWN native raw-link reveal (only on a `<>` dismiss — Bug 65). */
  suppressNative: boolean;
}

/**
 * Resolve the whole-link reveal from the parse-derived inputs (AB16b). Pure (Lesson 6).
 *
 *  - **dismissed** → the whole link is hidden AND Obsidian's native raw link is **actively suppressed**
 *    (Bug 65) — the plugin overrides even where Obsidian would reveal.
 *  - **engaged** → the link is shown and PINNED (it does not flip while a crop/panel holds the image,
 *    so the line never reflows mid-interaction — Bug 86).
 *  - otherwise the link reveals **for looking** per the mode (native: the active line; auto: + hover;
 *    always: everywhere), OR whenever the cursor sits **anywhere on the link** (body or `{…}`).
 *  - **Mutual exclusion BY CONSTRUCTION (D16):** when the cursor is within the BODY span Obsidian reveals
 *    the native raw link, so the stand-in is hidden; otherwise the stand-in carries the body. The `{…}`
 *    shows/hides as ONE WHOLE with the body (D17) — so the native↔stand-in swap at the body/`{…}`
 *    boundary is seamless and the whole link stays visible while the cursor is anywhere on it.
 */
export function resolveLinkReveal(ev: LinkRevealInput): LinkRevealState {
  // Dismiss hides everything AND suppresses the native (Bug 65) — and collapses the reserve (the user
  // explicitly cleared the source; no placeholder gap is left behind).
  if (ev.dismissed) return { showStandIn: false, reserveStandIn: false, showAttr: false, suppressNative: true };
  const naturalShow =
    ev.engaged ||
    ev.mode === "always" ||
    ev.onLine ||
    (ev.mode === "auto" && ev.hovered);
  const show = naturalShow || ev.cursorInBody || ev.cursorInAttr;
  // The stand-in HOLDS the source box whenever the native is NOT carrying the body — visible when
  // revealed, an invisible placeholder otherwise — so the box stays constant and the image never
  // reflows. It collapses ONLY when the cursor is within the body (native carries the identical box).
  const reserveStandIn = !ev.cursorInBody;
  if (!show) return { showStandIn: false, reserveStandIn, showAttr: false, suppressNative: false };
  // Cursor within the body → native carries it (hide the stand-in); otherwise the stand-in carries it.
  return { showStandIn: !ev.cursorInBody, reserveStandIn, showAttr: true, suppressNative: false };
}
