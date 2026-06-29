// Pure decisions for the toolbar ↔ sub-panel / palette ACTIVE REGION (D6/F14/AD8). Kept out of the
// DOM so they are unit-testable (AD7/Lesson 6); the hover BINDING and the CSS coupling are the impure
// half (region-hover.ts + styles.css). These are the branch points the event handlers consult.

// Bug 62 (+ click-boundary follow-up) — should an ACTIVE click dismiss/close the open editing UI
// (and PERSIST any open filter/size panel, the auto-persist single source write)? Three rules, in
// order:
//   • CROP active → NO click ever dismisses: clicks and drags on the image, the resize/rotate handles
//     and the dimmed ghost (the pan surface) are part of editing, so a stray click must never tear the
//     session down — crop ends ONLY via its own controls (the crop-button toggle, ✓ accept, ✗ cancel,
//     Esc).
//   • A modal FILTER/SIZE panel open → the click-away boundary is the SUB-PANEL itself (plus the
//     toolbar chrome docked to it), NOT the whole hover region: a click anywhere else — the image
//     INCLUDED — closes+persists it. (The image fills most of the canvas; treating it as a safe
//     harbor left the panel stuck open when the user clicked the image to dismiss — the reported bug.)
//   • Otherwise (bare toolbar, no panel) → dismiss only on a click OUTSIDE the whole active region
//     (image wrapper / toolbar / palette); a click inside it is part of the interaction.
// Hover-LEAVE is a SEPARATE path (it only HIDES — the panel stays open, Bug 63); this is the click
// path, which closes-and-persists for filter/size.
export function clickDismissesToolbar(opts: {
  cropActive: boolean;
  panelOpen: boolean;
  insidePanel: boolean;
  insideRegion: boolean;
}): boolean {
  if (opts.cropActive) return false;
  if (opts.panelOpen) return !opts.insidePanel;
  return !opts.insideRegion;
}

// AD12 — the ONE engagement predicate. "Is the plugin engaged with THIS image?" is the UNION of every
// way an image can be active: the editor cursor on its line, the pointer hovering it, the image
// selected/active (the editor focused on it), and any plugin surface open for it (a crop, or a filter /
// class / sub-menu panel). Every cross-cutting "is this image active?" decision — the raw-link reveal
// PIN (AB16b: the reveal does not flip while engaged, Bug 86), the `<>` dismiss auto-clear (fires ONLY
// on full DISengagement) and the toolbar greyed/active state — reads THIS one predicate, never a fresh
// per-surface `filterPanel || classPanel || submenu || cropEditor` check (the scattered chain it
// centralizes). The inputs are gathered from live CM/DOM state by the caller; only the union is pure.
export function isEngaged(opts: {
  cursorOnLine: boolean;
  hover: boolean;
  selected: boolean;
  panelOpen: boolean;   // any of filter / class / sub-menu open
  cropActive: boolean;
}): boolean {
  return opts.cursorOnLine || opts.hover || opts.selected || opts.panelOpen || opts.cropActive;
}
