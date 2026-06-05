// Pure placement geometry for the shared anchored sub-menu (D8/D9). Kept separate
// from the DOM so it can be unit-tested (T-L6): given the anchor rect, the panel
// size, the placement and the viewport, compute a fixed {top,left} that keeps the
// panel FULLY visible (D9 — never clipped, never scrolled).

export type SubmenuPlacement = "under-toolbar" | "beside-image";

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
}

export const SUBMENU_GAP = 8;
export const SUBMENU_MARGIN = 6;

function clamp(v: number, min: number, max: number): number {
  // When the panel is larger than the available span, prefer pinning to the start
  // edge (min) so its top/left stay on-screen rather than its bottom/right.
  if (max < min) return min;
  return Math.max(min, Math.min(v, max));
}

/**
 * Place an anchored sub-menu so it is fully on screen.
 *
 * - `under-toolbar`: hangs directly below the anchor (the toolbar), left-aligned;
 *   flips above the anchor if it would overflow the bottom edge.
 * - `beside-image`: docks to the right of the anchor (the image), top-aligned;
 *   flips to the left side if it would overflow the right edge.
 *
 * Both axes are then clamped into the viewport (minus a small margin) so nothing
 * is ever clipped.
 */
export function placeSubmenu(
  anchor: Rect,
  panel: Size,
  placement: SubmenuPlacement,
  viewport: Viewport,
  gap: number = SUBMENU_GAP,
  margin: number = SUBMENU_MARGIN,
  allowFlip: boolean = true
): Placement {
  const maxLeft = viewport.width - panel.width - margin;
  const maxTop = viewport.height - panel.height - margin;

  let top: number;
  let left: number;

  if (placement === "under-toolbar") {
    top = anchor.bottom + gap;
    // Flip above when it would overflow the bottom and there is more room above.
    if (top + panel.height > viewport.height - margin) {
      const above = anchor.top - gap - panel.height;
      if (above >= margin) top = above;
    }
    left = anchor.left;
  } else {
    left = anchor.right + gap;
    // Flip to the left side when it would overflow the right edge — but only if
    // allowed. The filter panel disables this (allowFlip=false) so it never lands
    // on the left over the file explorer; it just clamps to the right edge (Bug 3).
    if (allowFlip && left + panel.width > viewport.width - margin) {
      const leftSide = anchor.left - gap - panel.width;
      if (leftSide >= margin) left = leftSide;
    }
    top = anchor.top;
  }

  return {
    top: clamp(top, margin, maxTop),
    left: clamp(left, margin, maxLeft),
  };
}

// ---- Exit-reason routing (F14/AD8/D6) -------------------------------------
// The shared host is auto-persist AND carries an explicit accept/cancel. The teardown must know
// WHICH exit happened, because they fan out to different owner callbacks:
//   - "commit"  — ✓ accept, Enter, click-away, dismiss, context loss: the working state is
//                 persisted ONCE (one source write / one undo step). This is the auto-persist leave.
//   - "cancel"  — ✗ cancel, Esc: the edits are DISCARDED — NO source write; the owner reverts the
//                 live preview to the pre-open state (re-render from the unchanged source).
//   - "silent"  — plugin unload only: neither persist nor revert (no source write while the plugin
//                 is going away; the DOM is being torn down anyway).
// Keeping the mapping pure makes the routing unit-testable away from the DOM (AD7).
export type SubmenuExit = "commit" | "cancel" | "silent";

export function submenuExitEffect(exit: SubmenuExit): { commit: boolean; cancel: boolean } {
  return { commit: exit === "commit", cancel: exit === "cancel" };
}
