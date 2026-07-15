// The Obsidian-free DOM shell for a caption element, SHARED by both consumers so the `.lie-caption`
// class + structure live in ONE place (R0):
//   - the plugin (`caption.ts`) builds a `<div>` shell and renders the caption Markdown INTO it via
//     the platform renderer (`MarkdownRenderer`, AD9);
//   - the standalone runtime builds a `<span>` shell (valid phrasing content inside the foreign
//     page's `<p>`) and renders inline Markdown into it with its OWN minimal renderer
//     (`runtime-markdown.ts`) — off-Obsidian there is no platform `MarkdownRenderer` to reuse, so
//     that is not a parallel reimplementation of a platform capability (AD9); fidelity is bounded by
//     the lossy alt attribute.
// The caption TEXT logic is reused too — both paths derive the text from `caption-logic.ts`.
// `activeDocument` is Obsidian's window-aware global; off-Obsidian the standalone runtime SHIMS it
// (see `runtime.ts`), so this shared module stays identical for both callers (Bug 119).
export function createCaptionEl(tag: "div" | "span" = "div"): HTMLElement {
  const el = activeDocument.createElement(tag);
  el.className = "lie-caption";
  el.setAttribute("contenteditable", "false");
  return el;
}

// The layout markers that ride the OUTER (Decision 28). When a caption host wraps the image they
// MOVE to the host (the new flow participant) so a floated/centred image aligns as an image+caption
// unit, not as the bare image inside an un-aligned host. `lie-inline` is excluded — inline images
// use the D9.1 hover caption, not a below-caption host.
const LAYOUT_MARKERS = ["lie-float-left", "lie-float-right", "lie-block-left", "lie-block-center", "lie-block-right"];

// Wrap a rendered `.lie-image-area` plus a PLAIN-TEXT caption in a `.lie-has-caption` shrink-wrap
// host — the off-Obsidian caption structure (the plugin uses its `.lie-box` as the host instead, so
// this is the runtime's path). The host is the caption's containing block, so the `.lie-caption`
// CSS sizes it to the image width with no JS width-sync (D9). No-op-safe: bails when there is no
// caption text or the host already exists. Pure DOM + Obsidian-free, so it is reused by the runtime
// and unit-testable. `text` is already extracted via caption-logic's `captionFromAlt` (size stripped).
// Sets the caption to plain `text` and RETURNS the caption element so the caller can upgrade its
// content afterwards (the runtime renders inline Markdown into it — runtime-only, AD9).
export function mountCaption(outer: HTMLElement, text: string): HTMLElement | null {
  const parent = outer.parentElement;
  if (!text || !parent || parent.classList.contains("lie-has-caption")) return null;
  const host = activeDocument.createElement("span");
  host.className = "lie-has-caption";
  for (const m of LAYOUT_MARKERS) {
    if (outer.classList.contains(m)) { outer.classList.remove(m); host.classList.add(m); }
  }
  parent.insertBefore(host, outer);
  host.appendChild(outer);
  const caption = createCaptionEl("span");
  caption.textContent = text;
  host.appendChild(caption);
  return caption;
}
