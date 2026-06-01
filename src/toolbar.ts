import { setIcon } from "obsidian";
import { t, TranslationKey } from "./i18n";
import { planOverflow, CollapsibleGroup } from "./toolbar-logic";

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
 * Build the toolbar element from the grouped model. "always" groups render as a
 * single submenu trigger (Layout). "auto" groups render expanded but fold to a
 * trigger when the toolbar overflows its container (D3) — re-evaluated on resize.
 */
export function buildToolbarElement(items: ToolbarItem[]): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.classList.add("lie-toolbar");

  const autoGroups: { group: ToolbarGroup; expandedEl: HTMLElement; trigger: HTMLElement }[] = [];

  for (const item of items) {
    if (item.kind === "button") {
      toolbar.appendChild(makeButton(item));
      continue;
    }
    if (item.collapse === "always") {
      toolbar.appendChild(makeGroupTrigger(item));
      continue;
    }
    // "auto" group: keep both an expanded span and a (hidden) trigger, swap on fit.
    const expanded = document.createElement("span");
    expanded.classList.add("lie-toolbar-group");
    expanded.dataset["lieGroup"] = item.id;
    for (const btn of item.buttons) expanded.appendChild(makeButton(btn));
    const trigger = makeGroupTrigger(item);
    trigger.style.display = "none";
    toolbar.appendChild(expanded);
    toolbar.appendChild(trigger);
    autoGroups.push({ group: item, expandedEl: expanded, trigger });
  }

  if (autoGroups.length) setupOverflow(toolbar, autoGroups);
  return toolbar;
}

// Fold "auto" groups when the toolbar would overflow its container, re-checking on
// container resize. The decision (which groups fold) is the pure planOverflow.
function setupOverflow(
  toolbar: HTMLElement,
  autoGroups: { group: ToolbarGroup; expandedEl: HTMLElement; trigger: HTMLElement }[]
): void {
  const relayout = (): void => {
    // Measure everything expanded first.
    for (const g of autoGroups) { g.expandedEl.style.display = ""; g.trigger.style.display = "none"; }
    const container = toolbar.parentElement;
    if (!container) return;
    const available = container.clientWidth || window.innerWidth;

    const groupSpecs: CollapsibleGroup[] = autoGroups.map((g) => ({
      id: g.group.id,
      expandedWidth: g.expandedEl.offsetWidth,
      triggerWidth: 32,
    }));
    const base = toolbar.scrollWidth - groupSpecs.reduce((s, g) => s + g.expandedWidth, 0);
    const folded = planOverflow(available, base, groupSpecs);

    for (const g of autoGroups) {
      const fold = folded.has(g.group.id);
      g.expandedEl.style.display = fold ? "none" : "";
      g.trigger.style.display = fold ? "" : "none";
    }
  };

  // Re-run when the surrounding column is resized.
  const ro = new ResizeObserver(() => relayout());
  const observe = (): void => {
    if (toolbar.parentElement) ro.observe(toolbar.parentElement);
    relayout();
  };
  // Defer until attached/laid out.
  requestAnimationFrame(observe);
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
