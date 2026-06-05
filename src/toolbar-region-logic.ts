// Pure decisions for the toolbar ↔ sub-panel / palette ACTIVE REGION (D6/F14/AD8). Kept out of the
// DOM so they are unit-testable (AD7/T-L6); the hover BINDING and the CSS coupling are the impure
// half (region-hover.ts + styles.css). These are the branch points the event handlers consult.

// Bug 1 — should an ACTIVE click dismiss the toolbar (and PERSIST any open filter/size panel, the
// auto-persist single source write)? Two rules:
//   • A click that lands INSIDE the active region (image wrapper / toolbar / open panel / palette /
//     crop chrome) is part of the interaction and never dismisses.
//   • While the IN-PLACE CROP editor is active NO outside click dismisses at all: clicks and drags on
//     the image, the resize/rotate handles and the dimmed ghost (the pan surface) are part of
//     editing, so a stray click must never tear the session down — crop ends ONLY via its own
//     controls (the crop-button toggle, ✓ accept, ✗ cancel, Esc).
// Hover-LEAVE is a SEPARATE path (it only HIDES — the panel stays open, Bug 2); this is the click
// path, which closes-and-persists for filter/size.
export function clickDismissesToolbar(opts: { insideRegion: boolean; cropActive: boolean }): boolean {
  if (opts.cropActive) return false;
  return !opts.insideRegion;
}
