// The six layout icons (F15) — hand-drawn in the Lucide style (24-grid, 2px stroke, round caps,
// currentColor), a coherent `gallery-vertical` family: a frame line top + bottom, with the image
// box positioned (BLOCK) / boxed in a corner with text beside it (FLOAT) / sitting small in a text
// line (INLINE). Lucide ships no image-to-text-relationship icons (like Word/Google Docs, we draw
// our own). Registered via Obsidian's `addIcon`, which wraps the content in `<svg viewBox="0 0 100
// 100">` — so the 24-grid artwork is scaled by 100/24 (the same device as brand-icon.ts). The
// source of truth for the artwork is `layout-icons-preview.html` at the repo root — keep in sync.
import { addIcon } from "obsidian";
import { Layout } from "./transforms";

// All six layout states in toolbar order (block trio · float pair · inline). Drives the toolbar
// buttons, the command set, the editing-toolbar submenu and the active-state read.
export const LAYOUTS: Layout[] = [
  "block-left", "block-center", "block-right", "float-left", "float-right", "inline",
];

// Layout → the registered icon id used with `setIcon`.
export const LAYOUT_ICON_ID: Record<Layout, string> = {
  "block-left": "lie-block-left",
  "block-center": "lie-block-center",
  "block-right": "lie-block-right",
  "float-left": "lie-float-left",
  "float-right": "lie-float-right",
  inline: "lie-inline-icon",
};

// 24-grid inner artwork per state (verbatim from layout-icons-preview.html).
const ART: Record<Layout, string> = {
  "block-left":
    '<line x1="3" y1="3" x2="21" y2="3"/><rect x="3" y="7.5" width="9" height="9" rx="2"/><line x1="3" y1="21" x2="21" y2="21"/>',
  "block-center":
    '<line x1="3" y1="3" x2="21" y2="3"/><rect x="7.5" y="7.5" width="9" height="9" rx="2"/><line x1="3" y1="21" x2="21" y2="21"/>',
  "block-right":
    '<line x1="3" y1="3" x2="21" y2="3"/><rect x="12" y="7.5" width="9" height="9" rx="2"/><line x1="3" y1="21" x2="21" y2="21"/>',
  "float-left":
    '<line x1="3" y1="3" x2="21" y2="3"/><rect x="3" y="7.5" width="8" height="9" rx="2"/>' +
    '<line x1="15" y1="7.5" x2="21" y2="7.5"/><line x1="15" y1="12" x2="21" y2="12"/><line x1="15" y1="16.5" x2="21" y2="16.5"/>' +
    '<line x1="3" y1="21" x2="21" y2="21"/>',
  "float-right":
    '<line x1="3" y1="3" x2="21" y2="3"/><rect x="13" y="7.5" width="8" height="9" rx="2"/>' +
    '<line x1="3" y1="7.5" x2="9" y2="7.5"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="3" y1="16.5" x2="9" y2="16.5"/>' +
    '<line x1="3" y1="21" x2="21" y2="21"/>',
  inline:
    '<line x1="3" y1="3" x2="21" y2="3"/><rect x="9.5" y="7.5" width="5" height="9" rx="2"/>' +
    '<line x1="3" y1="16.5" x2="6" y2="16.5"/><line x1="18" y1="16.5" x2="21" y2="16.5"/><line x1="3" y1="21" x2="21" y2="21"/>',
};

// addIcon wraps in `<svg viewBox="0 0 100 100">`; scale the 24-grid by 100/24 and carry the Lucide
// stroke attributes on the group (stroke-width 2 in the 24-grid → 2 visual px at icon size).
const GROUP = '<g transform="scale(4.16667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

export function registerLayoutIcons(): void {
  for (const layout of LAYOUTS) addIcon(LAYOUT_ICON_ID[layout], `${GROUP}${ART[layout]}</g>`);
}

// The layout a rendered image currently carries — read from the marker class on its `.lie-image-area`
// outer (buildLayers derives `lie-inline` / `lie-<layout>` there). Drives the toolbar active-state.
export function currentLayout(img: HTMLImageElement): Layout | undefined {
  const outer = img.closest<HTMLElement>(".lie-image-area");
  if (!outer) return undefined;
  if (outer.classList.contains("lie-inline")) return "inline";
  for (const layout of LAYOUTS) if (outer.classList.contains(`lie-${layout}`)) return layout;
  return undefined;
}
