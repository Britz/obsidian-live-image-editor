import { setIcon } from "obsidian";
import { t } from "./i18n";
import { placeSubmenu, SubmenuPlacement, Rect, ContentBound, SubmenuExit, submenuExitEffect } from "./anchored-submenu-logic";
import { bindRegionHover } from "./region-hover";

export interface SubmenuOptions {
  // Caller-built content (sliders, presets, size inputs, …) shown in the body.
  body: HTMLElement;
  // Where to dock: compact menus hang under the toolbar, the large filter panel
  // sits beside the image (D8). Only placement varies — everything else is shared.
  placement: SubmenuPlacement;
  // The element to measure for placement: the toolbar (under-toolbar) or the
  // image (beside-image). OMITTED for `centered` (no single element to dock to —
  // the multi-image panels act on a selection, 0.5.2).
  anchor?: HTMLElement;
  // The editing toolbar to grey out + disable while the sub-menu is open (D8).
  toolbar?: HTMLElement | null;
  // Header label (defaults to none → no title text, just the icon actions).
  title?: string;
  // Persist the working state. Auto-persist (AD8/D6): while the panel is open the working state is
  // a LIVE DOM preview only (no source write); LEAVING the panel — ✓ accept, Enter, click-away,
  // dismiss, context loss — persists it ONCE, as a single undo step. The per-panel Reset and the
  // ✗ cancel (`onCancel`) are the in-session reverts; Ctrl/Cmd-Z reverts after a commit.
  onCommit: () => void;
  // DISCARD the working state and restore the pre-open preview (F14): fired ONLY on ✗ cancel / Esc.
  // No source write happened while open, so the unchanged source IS the pre-open state — the owner
  // re-renders the live DOM from it. Omitted ⇒ cancel just tears down (e.g. nothing to revert).
  onCancel?: () => void;
  // Optional per-panel reset: resets ONLY this panel's working state (e.g. just the
  // size, or just the crop) and updates the live preview — NOT the whole transform
  // like the toolbar's reset-all. The panel stays open. Shown as a header icon.
  onReset?: () => void;
  // The panel element was removed — clear any reference the owner holds.
  onClose?: () => void;
  // Extra class on the root, e.g. to widen the filter panel.
  rootClass?: string;
  // Beside-image only: allow flipping to the side of the anchor with MORE room when
  // the panel fits there (D7/Bug 77). Defaults to true. The flip's "room" is measured
  // within `contentBound` (below) when given, so a left flip never lands over the file
  // explorer (the Bug-64 guard); pass false to disable flipping entirely.
  allowFlip?: boolean;
  // Beside-image only: the horizontal bound the side-of-more-room flip is measured
  // against (Bug 77) — the editor content pane, EXCLUDING the left sidebar. Evaluated
  // live on every reposition (the pane moves on resize / sidebar toggle). Returning
  // null (pane not found) falls back to the viewport. Omitted ⇒ viewport (unchanged).
  contentBound?: () => ContentBound | null;
  // Hide (instead of clamp-sticking) when the anchor scrolls out of view, and
  // re-show when it returns — so the panel tracks the image and disappears with it
  // rather than clinging to a corner (Bug 64).
  hideWhenAnchorOffscreen?: boolean;
  // Bind the panel's visibility to hover (D6/D7/B4): the panel is visible only
  // while the pointer is over this region (the image+toolbar) OR over the panel
  // itself, and hidden otherwise — so it shows/hides WITH the toolbar while still
  // counting as part of the active region (interacting with it keeps it open). This
  // is visibility, not dismissal; the panel stays "open" until the trigger is
  // clicked again or context is lost.
  hoverRegion?: HTMLElement;
}

/**
 * The one shared anchored sub-menu (T9/D10): greyed-out toolbar, anchored placement,
 * fully visible (never clipped/scrolled, D9). Reused by the size, crop and filter
 * panels — placement is the only thing that differs (D8). AUTO-PERSIST + explicit accept/cancel
 * (AD8/D6/F14): while open the working state is a LIVE DOM preview only. The header carries the
 * per-panel Reset, a ✗ CANCEL (discard → `onCancel`, no source write) and a ✓ ACCEPT (persist +
 * close). Every OTHER leave path — Enter, click-away, the trigger toggle, selecting another image,
 * the anchor scrolling out of the DOM — persists ONCE via `onCommit` (one undo step), exactly like
 * ✓ accept. Esc cancels (pairs with ✗); Enter accepts (pairs with ✓). The exit REASON is routed
 * through `submenuExitEffect` so the teardown fires the right callback. Image + toolbar + the open
 * panel form ONE active region (D6): the toolbar stays visible (greyed) and the panel stays shown
 * while the pointer is anywhere in that region — including the gap while travelling image→panel —
 * and the two hide TOGETHER when it is left. Toggle behaviour (click trigger again to close) is the
 * owner's job: it checks `isOpen()` and calls `close()`.
 */
export class AnchoredSubmenu {
  private el: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private opts: SubmenuOptions | null = null;
  private closed = false;
  private offscreen = false;
  private hoverShown = true; // overridden by hoverRegion binding
  private hoverCleanup: (() => void) | null = null;

  isOpen(): boolean {
    return this.el !== null;
  }

  open(opts: SubmenuOptions): void {
    if (this.el) return;
    this.opts = opts;
    this.closed = false;

    const panel = activeDocument.createElement("div");
    panel.classList.add("lie-submenu");
    if (opts.rootClass) panel.classList.add(opts.rootClass);
    panel.appendChild(this.buildHeader(opts.title));
    panel.appendChild(opts.body);
    opts.body.classList.add("lie-submenu-body");

    // Render off-screen first so we can measure its true (content) size, then place it fully
    // on-screen (D9). `.lie-submenu` is position:fixed (viewport coords); `.lie-measuring` hides it
    // at 0,0 (visibility:hidden, so it still lays out and is measurable) while we measure — both in
    // styles.css. Removed once placed (no inline style writes — Obsidian-review compliance).
    panel.classList.add("lie-measuring");
    activeDocument.body.appendChild(panel);
    this.el = panel;

    // Grey out + disable the toolbar while open (D8). Set BEFORE the hover binding/reposition so
    // the toolbar is part of the combined active region from the first visibility pass (D6).
    this.toolbar = opts.toolbar ?? null;
    this.toolbar?.classList.add("lie-toolbar-inactive");

    this.bindHover(panel, opts.hoverRegion);
    this.reposition();
    panel.classList.remove("lie-measuring");

    activeDocument.addEventListener("keydown", this.handleKeyDown, true);
    window.addEventListener("resize", this.reposition);
    window.addEventListener("scroll", this.reposition, true);
  }

  // Bind the ONE active region (D6): image + toolbar + the open panel, driven by the shared
  // `bindRegionHover` so the toolbar (greyed) and the panel ride a SINGLE hover signal — they never
  // desync from a competing CSS `:hover` (that desync was the flicker / greyed-flap bug). The binder
  // keeps the region active while the pointer is over ANY member, bridges the image→panel travel
  // grace, and is robust to the in-chrome toolbar being NESTED inside the image wrapper (moving
  // toolbar→image stays "inside"). The two hide together when the region is left. With no `region`
  // (centered multi-image mode: no overlay) the panel is simply always shown until dismissed.
  private bindHover(panel: HTMLElement, region?: HTMLElement): void {
    if (!region) { this.hoverShown = true; return; }
    this.hoverShown = true; // opened by a click while hovering
    // The toolbar (the floating bar especially) lives OUTSIDE the image region, so it is its own
    // hover member — otherwise moving onto it would read as leaving the region.
    this.hoverCleanup = bindRegionHover([region, panel, this.toolbar], (active) => {
      this.hoverShown = active;
      this.updateVisibility();
    });
  }

  // Recompute placement against the current anchor/viewport (also on scroll/resize
  // so the menu tracks the image, since the toolbar scrolls with it — D1), then
  // resolve visibility (offscreen + hover) and place only while visible.
  private reposition = (): void => {
    this.updateVisibility();
  };

  private updateVisibility(): void {
    if (!this.el || !this.opts) return;
    // Centered (multi-image) panels have NO anchor — they float in the viewport centre and stay
    // shown until accept/cancel/click-away, so skip the anchor-bound visibility/offscreen logic.
    if (!this.opts.anchor) {
      this.el.classList.remove("lie-submenu-hidden");
      this.place();
      return;
    }
    // The anchor was removed from the DOM (e.g. the live-preview widget that owns it
    // was destroyed when its image scrolled out of the CM6 viewport). Self-close so
    // the panel doesn't linger orphaned against a detached anchor, leaking its hover
    // and window scroll/resize listeners — the owner's onClose clears its reference.
    if (!this.opts.anchor.isConnected) { this.close(); return; }
    const a = this.opts.anchor.getBoundingClientRect();
    this.offscreen = !!this.opts.hideWhenAnchorOffscreen && (a.bottom <= 0 || a.top >= window.innerHeight);

    const show = !this.offscreen && (this.hoverShown || !this.opts.hoverRegion);
    this.el.classList.toggle("lie-submenu-hidden", !show);
    // The toolbar rides the SAME combined-region state (D6): `lie-region-active` keeps it visible
    // (greyed) while the region is active and lets it hide TOGETHER with the panel when left. With
    // no hoverRegion (centered multi-image mode) `show` is always true → the bar stays put.
    this.toolbar?.classList.toggle("lie-region-active", show);
    if (show) this.place();
  }

  private place(): void {
    if (!this.el || !this.opts) return;
    const a = this.opts.anchor?.getBoundingClientRect();
    const anchorRect: Rect = a
      ? { top: a.top, left: a.left, right: a.right, bottom: a.bottom, width: a.width, height: a.height }
      : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; // centered ignores the anchor
    const { top, left } = placeSubmenu(
      anchorRect,
      { width: this.el.offsetWidth, height: this.el.offsetHeight },
      this.opts.placement,
      { width: window.innerWidth, height: window.innerHeight },
      undefined,
      undefined,
      this.opts.allowFlip ?? true,
      this.opts.contentBound?.() ?? undefined,
      // beside-image: align the panel's TOP to the toolbar (a sticky reference just above the image),
      // so the panel + toolbar share a top edge; it only slides up on a window-bottom overflow (Bug 87).
      this.toolbar?.getBoundingClientRect().top
    );
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }

  // Leave the panel, routing the EXIT reason (F14/AD8/D6 — see `submenuExitEffect`):
  //   - "commit" (the default — ✓ accept, Enter, click-away, dismiss, context loss): `onCommit`
  //     once, the single undo step for the session;
  //   - "cancel" (✗ cancel, Esc): `onCancel` — discard, no source write, revert the preview;
  //   - "silent" (plugin unload): neither — no source write while the plugin is going away.
  // Idempotent: a context-loss dismiss and the trigger toggle can't double-fire.
  close(exit: SubmenuExit = "commit"): void {
    if (this.closed) return;
    this.closed = true;
    this.hoverCleanup?.();
    this.hoverCleanup = null;
    activeDocument.removeEventListener("keydown", this.handleKeyDown, true);
    window.removeEventListener("resize", this.reposition);
    window.removeEventListener("scroll", this.reposition, true);
    this.toolbar?.classList.remove("lie-toolbar-inactive", "lie-region-active");

    const opts = this.opts;
    this.el?.remove();
    this.el = null;
    this.opts = null;

    const effect = submenuExitEffect(exit);
    if (effect.commit) opts?.onCommit();
    else if (effect.cancel) opts?.onCancel?.();
    opts?.onClose?.();
  }

  // Esc CANCELS (pairs with ✗ — discard, no write); Enter ACCEPTS (pairs with ✓ — persist + close,
  // identical to leaving). Captured so they win over the editor while a panel is open.
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.close("cancel");
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this.close("commit");
    }
  };

  private buildHeader(title?: string): HTMLElement {
    const header = activeDocument.createElement("div");
    header.classList.add("lie-submenu-header");

    const label = activeDocument.createElement("span");
    label.classList.add("lie-submenu-title");
    label.textContent = title ?? "";
    header.appendChild(label);

    const actions = activeDocument.createElement("div");
    actions.classList.add("lie-submenu-actions");

    // The header actions (F14/AD8/D6): the optional per-panel Reset (resets only this panel's
    // working state, keeps the panel open), then ✗ CANCEL (discard → no source write) and ✓ ACCEPT
    // (persist + close). Leaving/click-away still persists (auto-persist) — the icons make the two
    // outcomes explicit without changing that. Order: reset · cancel · accept (destructive before
    // affirmative, accept last as the primary action).
    if (this.opts?.onReset) {
      actions.appendChild(this.iconButton("lie-submenu-reset", "undo-2", t("resetThis"), () => this.opts?.onReset?.()));
    }
    actions.appendChild(this.iconButton("lie-submenu-cancel", "x", t("cancel"), () => this.close("cancel")));
    actions.appendChild(this.iconButton("lie-submenu-confirm", "check", t("accept"), () => this.close("commit")));

    header.appendChild(actions);
    return header;
  }

  // One header action icon. `mousedown` preventDefault keeps editor focus so the source write the
  // accept triggers stays one native undo step (mirrors the toolbar buttons); the click stops
  // propagating so it never reaches the document click-away dismiss.
  private iconButton(cls: string, icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = activeDocument.createElement("button");
    btn.classList.add("lie-submenu-icon-btn", cls);
    btn.setAttribute("aria-label", label);
    btn.title = label;
    setIcon(btn, icon);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }
}
