import { setIcon } from "obsidian";
import { t, TranslationKey } from "./i18n";

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

// A lightweight button-palette popup for a collapsed group (D3). Distinct from the
// modal AnchoredSubmenu (D8): no greyed toolbar, no confirm/cancel — clicking a
// button runs it and closes. Esc / click-outside also close it.
function openGroupPopup(trigger: HTMLElement, group: ToolbarGroup): void {
  const existing = document.querySelector(".lie-group-popup");
  if (existing) {
    existing.remove();
    if ((existing as HTMLElement).dataset["forId"] === group.id) return; // toggle off
  }

  const popup = document.createElement("div");
  popup.className = "lie-group-popup";
  popup.dataset["forId"] = group.id;
  for (const btn of group.buttons) {
    const b = makeButton(btn);
    b.addEventListener("click", () => popup.remove());
    popup.appendChild(b);
  }

  const rect = trigger.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${rect.left}px`;
  popup.style.zIndex = "1002";
  document.body.appendChild(popup);

  const close = (e?: Event): void => {
    if (e && (e.target === trigger || popup.contains(e.target as Node))) return;
    popup.remove();
    document.removeEventListener("mousedown", close, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  };
  setTimeout(() => {
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

function makeGroupTrigger(group: ToolbarGroup): HTMLButtonElement {
  const el = document.createElement("button");
  el.classList.add("lie-toolbar-btn", "lie-toolbar-group-trigger");
  el.dataset["lieGroup"] = group.id;
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
 * DIVIDERS (Bug 5: fold first, then wrap). An "always" group starts folded.
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
// can't decide WHEN to fold (Bug 5).
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
  // D1.1 — if even fully folded the bar needs more than one row, that is FINE as long as the
  // (wrapped) bar still fits the image's HEIGHT: it stays in-chrome, overlaying the image top
  // on hover. But if the image is too SHORT to hold it (height, not just width), it cannot
  // live inside Obsidian's `contain: paint` box at all (it would be clipped above/below) — so
  // FLAG the image `lie-float`; the plugin then shows the SAME toolbar floating on the body,
  // outside the clip. Comparing height-vs-image (not merely "wraps") is what keeps a
  // narrow-but-tall image's bar in-chrome. (The floating bar itself is position:fixed → no
  // offsetParent → host null → fits true → never flagged, no feedback loop.)
  const host = toolbar.offsetParent as HTMLElement | null;
  const fitsInsideHeight = host ? 8 + toolbar.offsetHeight <= host.clientHeight : true;
  toolbar.closest(".lie-wrapper")?.classList.toggle("lie-float", wraps() && !fitsInsideHeight);
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
    // position:fixed but recomputed on scroll, so it tracks the image rather than
    // staying pinned to the page (D1).
    toolbar.style.position = "fixed";
    toolbar.style.top = `${rect.top + 8}px`;
    toolbar.style.left = `${rect.left + 8}px`;
    toolbar.style.zIndex = "1000";
  }
}
