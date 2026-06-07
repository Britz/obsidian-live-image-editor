import { setIcon } from "obsidian";
import { t, TranslationKey } from "./i18n";
import { couplePaletteToRegion } from "./region-hover";

export interface ToolbarButton {
  kind: "button";
  id: string;
  icon: string;
  titleKey: TranslationKey;
  action: () => void;
}

export interface ToolbarGroup {
  kind: "group";
  id: string;
  icon: string; // trigger icon shown when the group is collapsed
  titleKey: TranslationKey;
  buttons: ToolbarButton[];
  // "always": always a submenu trigger (Layout group). "auto": shown expanded,
  // folds into a trigger only when the toolbar runs out of horizontal space (D3).
  collapse: "always" | "auto";
}

export type ToolbarItem = ToolbarButton | ToolbarGroup;

// Hover micro-animation keyed off the button/group id (Feature 1, ported from the icon-design prototype).
// The CSS lives in styles.css (`[data-anim="…"]:hover svg`); an id absent here gets the default
// `transform: scale(1.12)` (no `data-anim`). Reduced-motion is guarded in the stylesheet.
const ANIM_BY_ID: Record<string, string> = {
  "rotate-cw": "cw",
  "rotate-ccw": "ccw",
  "flip-h": "flip-h",
  "flip-v": "flip-v",
  "crop": "snap",
  "custom-size": "resize",
  "align-left": "align-l",
  "align-center": "align-c",
  "align-right": "align-r",
  "inline": "wrap",
  "snippets": "snap",
  "export": "down",
  "reset": "wiggle",
  "reset-all": "wiggle",
  // Group triggers (makeGroupTrigger): layout has a character animation; edit/filters keep the default scale.
  "layout": "quote",
};

// Kept for the command/registration mapping in main.ts (a flat icon+action).
export interface ToolbarAction {
  icon: string;
  titleKey: TranslationKey;
  action: () => void;
}

function makeButton(btn: ToolbarButton): HTMLButtonElement {
  const el = document.createElement("button");
  el.classList.add("lie-toolbar-btn");
  el.dataset["lieId"] = btn.id;
  const anim = ANIM_BY_ID[btn.id];
  if (anim) el.dataset["anim"] = anim;
  el.setAttribute("aria-label", t(btn.titleKey));
  el.title = t(btn.titleKey);
  setIcon(el, btn.icon);
  // Don't steal focus from the editor on press — so Obsidian's native undo (Ctrl+Z)
  // still targets the document the action edits.
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    btn.action();
  });
  return el;
}

// Close + fully tear down an open group popup (every path: button pick / toggle-off / click-away /
// Esc / region-leave). The detach hook (set in openGroupPopup) removes the region binding + document
// listeners so nothing leaks. Idempotent.
function closeGroupPopup(popup: HTMLElement): void {
  (popup as PopupEl)._lieDetach?.();
  popup.remove();
}
interface PopupEl extends HTMLElement { _lieDetach?: () => void; }

// A lightweight button-palette popup for a collapsed group (D3). Distinct from the modal
// AnchoredSubmenu (D8): NOT greyed/modal, no confirm/cancel — clicking a button runs it and closes.
// It IS coupled to the image + toolbar active region (Bug 64/D6): the popup sits on document.body
// (outside the wrapper's paint box), so without coupling, hovering it would drop the in-chrome bar's
// `.lie-wrapper:hover` and hide it. `couplePaletteToRegion` keeps the bar visible while the popup is
// hovered and closes the popup (bar + popup fade together) when the whole region is left. Esc /
// click-outside also close it.
function openGroupPopup(trigger: HTMLElement, group: ToolbarGroup): void {
  const existing = document.querySelector<HTMLElement>(".lie-group-popup");
  if (existing) {
    const wasSame = existing.dataset["forId"] === group.id;
    closeGroupPopup(existing);
    if (wasSame) return; // toggle off
  }

  const popup = document.createElement("div") as PopupEl;
  popup.className = "lie-group-popup";
  popup.dataset["forId"] = group.id;
  const close = (): void => closeGroupPopup(popup);
  for (const btn of group.buttons) {
    const b = makeButton(btn);
    b.addEventListener("click", () => close());
    popup.appendChild(b);
  }

  const rect = trigger.getBoundingClientRect();
  // position:fixed + z-index are in the `.lie-group-popup` rule (styles.css); only the trigger-rect
  // coordinates are dynamic and stay inline.
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${rect.left}px`;
  document.body.appendChild(popup);

  const unbindRegion = couplePaletteToRegion(popup, {
    wrapper: trigger.closest<HTMLElement>(".lie-wrapper"),
    toolbar: trigger.closest<HTMLElement>(".lie-toolbar"),
  }, close);

  const onDown = (e: Event): void => {
    if (e.target === trigger || popup.contains(e.target as Node)) return;
    close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  };
  popup._lieDetach = (): void => {
    unbindRegion();
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
  };
  window.setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

function makeGroupTrigger(group: ToolbarGroup): HTMLButtonElement {
  const el = document.createElement("button");
  el.classList.add("lie-toolbar-btn", "lie-toolbar-group-trigger");
  el.dataset["lieGroup"] = group.id;
  const anim = ANIM_BY_ID[group.id];
  if (anim) el.dataset["anim"] = anim;
  el.setAttribute("aria-label", t(group.titleKey));
  el.title = t(group.titleKey);
  setIcon(el, group.icon);
  el.addEventListener("mousedown", (e) => e.preventDefault()); // keep editor focus (undo)
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openGroupPopup(el, group);
  });
  return el;
}

/**
 * Build the toolbar from the grouped model (D2). A group renders BOTH an expanded
 * cluster and a fold-to-submenu trigger in one slot; standalone buttons share a
 * cluster. Clusters are joined by dividers. When the bar runs out of horizontal
 * space, `reflowToolbar` first FOLDS groups to their submenu trigger (Layout before
 * Edit) — and only if it still doesn't fit does the `flex-wrap` wrap it AT THE
 * DIVIDERS (Bug 37: fold first, then wrap). An "always" group starts folded.
 */
export function buildToolbarElement(items: ToolbarItem[]): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.classList.add("lie-toolbar");

  const clusters: HTMLElement[] = [];
  let run: HTMLElement | null = null;
  const flushRun = (): void => { if (run) { clusters.push(run); run = null; } };

  for (const item of items) {
    if (item.kind === "button") {
      if (!run) { run = document.createElement("span"); run.className = "lie-toolbar-cluster"; }
      run.appendChild(makeButton(item));
      continue;
    }
    flushRun();
    const slot = document.createElement("span");
    slot.classList.add("lie-toolbar-cluster", "lie-toolbar-group-slot");
    slot.dataset["lieGroup"] = item.id;
    // Fold priority: "always" groups fold first (highest), then the rest by document
    // order — so Layout (later) folds before Edit when both are "auto".
    slot.dataset["lieFold"] = String(item.collapse === "always" ? 100 : clusters.length);
    const expanded = document.createElement("span");
    expanded.className = "lie-toolbar-group";
    for (const btn of item.buttons) expanded.appendChild(makeButton(btn));
    slot.appendChild(expanded);
    slot.appendChild(makeGroupTrigger(item));
    if (item.collapse === "always") slot.classList.add("is-folded");
    clusters.push(slot);
  }
  flushRun();

  clusters.forEach((cluster, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "lie-toolbar-sep";
      toolbar.appendChild(sep);
    }
    toolbar.appendChild(cluster);
  });

  // Reflow on AVAILABLE-width changes — observe the positioned ancestor (the image
  // area / the viewport), NOT the toolbar itself: folding changes the toolbar's own
  // size and would feed back into a loop. The ancestor's width only changes when the
  // image/window resizes.
  window.setTimeout(() => {
    if (!toolbar.isConnected) return;
    reflowToolbar(toolbar);
    const host = toolbar.offsetParent as HTMLElement | null;
    if (host) new ResizeObserver(() => reflowToolbar(toolbar)).observe(host);
  }, 0);
  return toolbar;
}

// Fold groups to their submenu trigger (lowest fold-priority first) while the toolbar
// would wrap to more than one row; expand them again when there is room. Pure DOM
// toggling — the only thing that needs a measurement, since divider-wrapping alone
// can't decide WHEN to fold (Bug 37).
export function reflowToolbar(toolbar: HTMLElement): void {
  const slots = Array.from(toolbar.querySelectorAll<HTMLElement>(".lie-toolbar-group-slot"))
    .filter((s) => s.dataset["lieFold"] !== "100"); // "always" groups stay folded
  // Highest fold-priority folds first.
  const byFoldFirst = [...slots].sort((a, b) => Number(b.dataset["lieFold"]) - Number(a.dataset["lieFold"]));
  const rowH = 40; // a single toolbar row (button 28 + padding)
  const wraps = (): boolean => toolbar.offsetHeight > rowH;

  // Start fully expanded, then fold as needed.
  for (const s of byFoldFirst) s.classList.remove("is-folded");
  for (const s of byFoldFirst) {
    if (!wraps()) break;
    s.classList.add("is-folded");
  }
  // D1.1 — keep the in-chrome bar only while it does NOT dominate the image: it may overlay the
  // image top on hover, but once it would cover more than COVER_LIMIT of the image's HEIGHT the
  // image is "almost just toolbar", so FLAG it `lie-float` and show the SAME bar floating on the
  // body (outside Obsidian's `contain: paint` box, and positioned ABOVE the image). COVERAGE —
  // not "does it physically fit / wrap" — is the trigger, so a short-wide image floats out even
  // with a single-row bar, while a narrow-but-TALL image (low coverage) keeps its bar in-chrome.
  // (The floating bar itself is position:fixed → no offsetParent → host null → fits → never
  // flagged, no feedback loop.)
  const COVER_LIMIT = 0.6;
  const host = toolbar.offsetParent as HTMLElement | null;
  const fitsComfortably = host ? toolbar.offsetHeight + 8 <= host.clientHeight * COVER_LIMIT : true;
  toolbar.closest(".lie-wrapper")?.classList.toggle("lie-float", !fitsComfortably);
}

export class ImageToolbar {
  private el: HTMLElement | null = null;
  private activeImg: HTMLImageElement | null = null;
  private reposition: (() => void) | null = null;

  show(img: HTMLImageElement, items: ToolbarItem[]): void {
    this.hide();
    this.activeImg = img;
    const toolbar = buildToolbarElement(items);
    toolbar.classList.add("lie-toolbar-floating");
    document.body.appendChild(toolbar);
    this.el = toolbar;

    // Scroll WITH the image, not page-fixed (D1): re-anchor on scroll/resize.
    this.reposition = () => this.positionAbove(toolbar, img);
    this.reposition();
    window.addEventListener("scroll", this.reposition, true);
    window.addEventListener("resize", this.reposition);
  }

  hide(): void {
    if (this.reposition) {
      window.removeEventListener("scroll", this.reposition, true);
      window.removeEventListener("resize", this.reposition);
      this.reposition = null;
    }
    this.el?.remove();
    this.el = null;
    this.activeImg = null;
  }

  isVisible(): boolean {
    return this.el !== null;
  }

  getActiveImage(): HTMLImageElement | null {
    return this.activeImg;
  }

  private positionAbove(toolbar: HTMLElement, img: HTMLImageElement): void {
    const rect = img.getBoundingClientRect();
    const gap = 8;
    // position:fixed + z-index are in the `.lie-toolbar-floating` rule (styles.css); the bar is
    // fixed but recomputed on scroll, so it tracks the image rather than staying pinned to the page
    // (D1). Only the computed top/left coordinates below are dynamic and stay inline.
    // Place the bar truly ABOVE the image — its bottom sits `gap` above the image top — not
    // inset on top of it (the old `rect.top + 8` left a ~38px bar sitting on, and overhanging
    // below, a 24px image, D1.1). The toolbar is already on document.body with position:fixed,
    // so its offsetHeight/offsetWidth are measurable here.
    const above = rect.top - toolbar.offsetHeight - gap;
    // No room above (image near the viewport top) → fall back BELOW the image, not off-screen.
    toolbar.style.top = `${above >= 0 ? above : rect.bottom + gap}px`;
    // Anchor at the image's left edge; clamp so the (usually wider) bar doesn't overflow the
    // right viewport edge.
    const maxLeft = window.innerWidth - toolbar.offsetWidth - gap;
    toolbar.style.left = `${Math.max(gap, Math.min(rect.left + 8, maxLeft))}px`;
  }
}
