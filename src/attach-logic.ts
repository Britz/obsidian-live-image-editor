// Pure decisions for the post-processor attach path (Reading view AND post-processor-hosted embeds
// nested inside live preview — a table cell, a callout, a footnote popover). Kept out of the DOM so
// they are unit-testable (AD7/Lesson 6); the DOM walk itself is the impure half (main.ts).

// A duck-typed ancestor shape (structurally satisfied by a real DOM Element) so the walk is
// unit-testable with plain objects, no jsdom/real DOM needed.
export interface DisplayNode {
  style?: { display?: string };
  parentElement?: DisplayNode | null;
}

// Is `el` (or any of its ancestors) a host copy Obsidian itself has already superseded and hidden —
// an inline `display:none`, e.g. a table cell's static render once its row's own live cell editor
// takes over? Attach must leave a hidden copy alone (never decorate it, never spend a caption on it):
// only the one visible copy gets the one attach decision.
export function isHiddenHostCopy(el: DisplayNode | null | undefined): boolean {
  let node = el;
  while (node) {
    if (node.style?.display === "none") return true;
    node = node.parentElement;
  }
  return false;
}
