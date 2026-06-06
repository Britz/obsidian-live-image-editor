// Pure placement geometry for the shared anchored sub-menu (D8/D9). Kept separate
// from the DOM so it can be unit-tested (Lesson 6): given the anchor rect, the panel
// size, the placement and the viewport, compute a fixed {top,left} that keeps the
// panel FULLY visible (D9 — never clipped, never scrolled).

export type SubmenuPlacement = "under-toolbar" | "beside-image" | "centered";

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

// Horizontal bound for the `beside-image` side-of-more-room decision (Bug 77). The flip
// must measure room within the EDITOR CONTENT PANE, not the whole viewport, so the panel
// can dock left of the image only when there is room left of it INSIDE the pane — never
// over the file-explorer / left sidebar (the Bug-64 guard). Defaults to the full viewport
// `[0, width]` when omitted, leaving every existing caller unchanged.
export interface ContentBound {
  left: number;
  right: number;
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
 *   flips to whichever side has MORE room within `content` (D7/Bug 77) — but only
 *   when the panel actually fits on that side, and only when `allowFlip` is set.
 *
 * `content` bounds the side-of-more-room measurement to the editor content pane
 * (defaulting to the full viewport): room right = `content.right − anchor.right`,
 * room left = `anchor.left − content.left`. This keeps a left flip inside the pane
 * so it never lands over the file explorer / left sidebar (the Bug-64 guard).
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
  allowFlip: boolean = true,
  content?: ContentBound,
  topAnchorTop?: number
): Placement {
  const maxLeft = viewport.width - panel.width - margin;
  const maxTop = viewport.height - panel.height - margin;

  // Centered ignores the anchor entirely — it sits in the middle of the viewport. Used by the
  // multi-image panels (0.5.2), which act on a SELECTION rather than one anchored image, so there
  // is no single element to dock to. Still clamped so a panel taller than the viewport stays
  // top-visible.
  if (placement === "centered") {
    return {
      top: clamp((viewport.height - panel.height) / 2, margin, maxTop),
      left: clamp((viewport.width - panel.width) / 2, margin, maxLeft),
    };
  }

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
    // beside-image: dock on whichever side has MORE room within the content bound
    // (D7/Bug 77). `content` defaults to the full viewport, so callers that pass no
    // bound keep the old viewport-relative behaviour. Measuring within the editor
    // pane is what keeps a left flip off the file explorer (the Bug-64 guard).
    const bound = content ?? { left: 0, right: viewport.width };
    left = anchor.right + gap; // default: right of the image
    if (allowFlip) {
      const roomRight = bound.right - anchor.right;
      const roomLeft = anchor.left - bound.left;
      const leftSide = anchor.left - gap - panel.width;
      // Flip left only when the left side has more room AND the panel actually fits
      // there within the pane (so it never overhangs the sidebar). Otherwise stay
      // right; the on-screen clamp below pins it to the right edge if it overflows.
      const fitsLeft = leftSide >= bound.left && leftSide >= margin;
      if (roomLeft > roomRight && fitsLeft) left = leftSide;
    }
    // Vertical: align to the TOOLBAR's top when given (a fixed reference just above the image, so the
    // panel and the toolbar share a top edge) — else the image's top. The bottom clamp below slides it
    // UP only when it would overflow the window bottom; on the next reposition it snaps back to this top
    // (sticky at toolbar height, the slide-up is temporary). (Bug 87.)
    top = topAnchorTop ?? anchor.top;
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
