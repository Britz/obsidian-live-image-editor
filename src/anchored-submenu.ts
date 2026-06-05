import { setIcon } from "obsidian";
import { t } from "./i18n";
import { placeSubmenu, SubmenuPlacement, Rect } from "./anchored-submenu-logic";

export interface SubmenuOptions {
  // Caller-built content (sliders, presets, size inputs, …) shown in the body.
  body: HTMLElement;
  // Where to dock: compact menus hang under the toolbar, the large filter panel
  // sits beside the image (D8). Only placement varies — everything else is shared.
  placement: SubmenuPlacement;
  // The element to measure for placement: the toolbar (under-toolbar) or the
  // image (beside-image).
  anchor: HTMLElement;
  // The editing toolbar to grey out + disable while the sub-menu is open (D8).
  toolbar?: HTMLElement | null;
  // Header label (defaults to none → no title text, just the icon actions).
  title?: string;
  // Persist the working state. Auto-persist (AD8/D6): there is NO accept/cancel — while the
  // panel is open the working state is a LIVE DOM preview only; LEAVING the panel (close / Esc /
  // click-away / dismiss / context loss) persists it ONCE, as a single undo step. The only
  // in-session revert is the per-panel Reset (or Ctrl/Cmd-Z after leaving).
  onCommit: () => void;
  // Optional per-panel reset: resets ONLY this panel's working state (e.g. just the
  // size, or just the crop) and updates the live preview — NOT the whole transform
  // like the toolbar's reset-all. The panel stays open. Shown as a header icon.
  onReset?: () => void;
  // The panel element was removed — clear any reference the owner holds.
  onClose?: () => void;
  // Extra class on the root, e.g. to widen the filter panel.
  rootClass?: string;
  // Beside-image only: allow flipping to the left of the anchor when it would
  // overflow the right edge. The filter panel sets this false so it never lands on
  // the left over the file explorer (Bug 3). Defaults to true.
  allowFlip?: boolean;
  // Hide (instead of clamp-sticking) when the anchor scrolls out of view, and
  // re-show when it returns — so the panel tracks the image and disappears with it
  // rather than clinging to a corner (Bug 3).
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
 * panels — placement is the only thing that differs (D8). AUTO-PERSIST (AD8/D6): no
 * accept/cancel actions; the header carries only the optional per-panel Reset. While
 * open the working state is a live preview; EVERY leave path — Esc, click-away, the
 * trigger toggle, selecting another image, the anchor scrolling out of the DOM —
 * persists it ONCE via `onCommit` (one undo step). Toggle behaviour (click trigger
 * again to close) is the owner's job: it checks `isOpen()` and calls `close()`.
 */
export class AnchoredSubmenu {
  private el: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private opts: SubmenuOptions | null = null;
  private closed = false;
  private offscreen = false;
  private hoverShown = true; // overridden by hoverRegion binding
  private hoverTimer = 0;
  private hoverCleanup: (() => void) | null = null;

  isOpen(): boolean {
    return this.el !== null;
  }

  open(opts: SubmenuOptions): void {
    if (this.el) return;
    this.opts = opts;
    this.closed = false;

    const panel = document.createElement("div");
    panel.classList.add("lie-submenu");
    if (opts.rootClass) panel.classList.add(opts.rootClass);
    panel.appendChild(this.buildHeader(opts.title));
    panel.appendChild(opts.body);
    opts.body.classList.add("lie-submenu-body");

    // Render off-screen first so we can measure its true (content) size, then
    // place it fully on-screen (D9). position:fixed → viewport coordinates.
    panel.style.position = "fixed";
    panel.style.visibility = "hidden";
    panel.style.top = "0";
    panel.style.left = "0";
    document.body.appendChild(panel);
    this.el = panel;

    this.bindHover(panel, opts.hoverRegion);
    this.reposition();
    panel.style.visibility = "";

    // Grey out + disable the toolbar while open (D8).
    this.toolbar = opts.toolbar ?? null;
    this.toolbar?.classList.add("lie-toolbar-inactive");

    document.addEventListener("keydown", this.handleKeyDown, true);
    window.addEventListener("resize", this.reposition);
    window.addEventListener("scroll", this.reposition, true);
  }

  // The panel shows/hides with the toolbar's hover (B4) while still counting as
  // part of the active region (D7): visible while the pointer is over the image
  // region OR the panel; a short grace delay lets the pointer travel between them.
  private bindHover(panel: HTMLElement, region?: HTMLElement): void {
    if (!region) { this.hoverShown = true; return; }
    this.hoverShown = true; // opened by a click while hovering
    const enter = (): void => {
      window.clearTimeout(this.hoverTimer);
      this.hoverShown = true;
      this.updateVisibility();
    };
    const leave = (): void => {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => {
        this.hoverShown = false;
        this.updateVisibility();
      }, 160);
    };
    region.addEventListener("mouseenter", enter);
    region.addEventListener("mouseleave", leave);
    panel.addEventListener("mouseenter", enter);
    panel.addEventListener("mouseleave", leave);
    this.hoverCleanup = () => {
      region.removeEventListener("mouseenter", enter);
      region.removeEventListener("mouseleave", leave);
      panel.removeEventListener("mouseenter", enter);
      panel.removeEventListener("mouseleave", leave);
    };
  }

  // Recompute placement against the current anchor/viewport (also on scroll/resize
  // so the menu tracks the image, since the toolbar scrolls with it — D1), then
  // resolve visibility (offscreen + hover) and place only while visible.
  private reposition = (): void => {
    this.updateVisibility();
  };

  private updateVisibility(): void {
    if (!this.el || !this.opts) return;
    // The anchor was removed from the DOM (e.g. the live-preview widget that owns it
    // was destroyed when its image scrolled out of the CM6 viewport). Self-close so
    // the panel doesn't linger orphaned against a detached anchor, leaking its hover
    // and window scroll/resize listeners — the owner's onClose clears its reference.
    if (!this.opts.anchor.isConnected) { this.close(); return; }
    const a = this.opts.anchor.getBoundingClientRect();
    this.offscreen = !!this.opts.hideWhenAnchorOffscreen && (a.bottom <= 0 || a.top >= window.innerHeight);

    const show = !this.offscreen && (this.hoverShown || !this.opts.hoverRegion);
    this.el.style.display = show ? "" : "none";
    if (show) this.place();
  }

  private place(): void {
    if (!this.el || !this.opts) return;
    const a = this.opts.anchor.getBoundingClientRect();
    const anchorRect: Rect = {
      top: a.top, left: a.left, right: a.right, bottom: a.bottom, width: a.width, height: a.height,
    };
    const { top, left } = placeSubmenu(
      anchorRect,
      { width: this.el.offsetWidth, height: this.el.offsetHeight },
      this.opts.placement,
      { width: window.innerWidth, height: window.innerHeight },
      undefined,
      undefined,
      this.opts.allowFlip ?? true
    );
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }

  // Leave the panel. AUTO-PERSIST: `persist` (the default) runs `onCommit` once — the single
  // undo step for the whole editing session; every user-facing leave path uses it. `persist=false`
  // is the silent teardown for plugin unload (no source write while the plugin is going away).
  // Idempotent: a context-loss dismiss and the trigger toggle can't double-fire.
  close(persist = true): void {
    if (this.closed) return;
    this.closed = true;
    window.clearTimeout(this.hoverTimer);
    this.hoverCleanup?.();
    this.hoverCleanup = null;
    document.removeEventListener("keydown", this.handleKeyDown, true);
    window.removeEventListener("resize", this.reposition);
    window.removeEventListener("scroll", this.reposition, true);
    this.toolbar?.classList.remove("lie-toolbar-inactive");

    const opts = this.opts;
    this.el?.remove();
    this.el = null;
    this.opts = null;

    if (persist) opts?.onCommit();
    opts?.onClose?.();
  }

  // Esc LEAVES the panel — which, under auto-persist, persists the work (it is not a discard;
  // the only revert is Reset or Ctrl/Cmd-Z afterwards).
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  };

  private buildHeader(title?: string): HTMLElement {
    const header = document.createElement("div");
    header.classList.add("lie-submenu-header");

    const label = document.createElement("span");
    label.classList.add("lie-submenu-title");
    label.textContent = title ?? "";
    header.appendChild(label);

    const actions = document.createElement("div");
    actions.classList.add("lie-submenu-actions");

    // Auto-persist (AD8/D6): NO accept/cancel buttons — leaving the panel persists the work and
    // Reset is the only in-session revert. The header carries just the optional per-panel Reset
    // (resets only this panel's working state, keeps the panel open).
    if (this.opts?.onReset) {
      const reset = document.createElement("button");
      reset.classList.add("lie-submenu-icon-btn", "lie-submenu-reset");
      reset.setAttribute("aria-label", t("resetThis"));
      reset.title = t("resetThis");
      setIcon(reset, "undo-2");
      reset.addEventListener("click", () => this.opts?.onReset?.());
      actions.appendChild(reset);
    }

    header.appendChild(actions);
    return header;
  }
}
