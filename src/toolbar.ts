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
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openGroupPopup(el, group);
  });
  return el;
}

/**
 * Build the toolbar from the grouped model as a row of NON-BREAKING clusters
 * separated by dividers. "always" groups render as a single submenu trigger
 * (Layout); "auto" groups render expanded; consecutive standalone buttons share a
 * cluster. The toolbar is `flex-wrap: wrap`, so when there isn't enough horizontal
 * space it wraps to multiple rows AT THE DIVIDERS (each cluster stays intact) —
 * mobile-friendly (D3, revised: wrap at dividers, no fold-to-submenu).
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
    if (item.collapse === "always") {
      const c = document.createElement("span");
      c.className = "lie-toolbar-cluster";
      c.appendChild(makeGroupTrigger(item));
      clusters.push(c);
    } else {
      const expanded = document.createElement("span");
      expanded.classList.add("lie-toolbar-cluster", "lie-toolbar-group");
      expanded.dataset["lieGroup"] = item.id;
      for (const btn of item.buttons) expanded.appendChild(makeButton(btn));
      clusters.push(expanded);
    }
  }
  flushRun();

  // Join clusters with dividers (a divider before every cluster but the first).
  clusters.forEach((cluster, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "lie-toolbar-sep";
      toolbar.appendChild(sep);
    }
    toolbar.appendChild(cluster);
  });

  return toolbar;
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
