import { App, Component, MarkdownRenderer } from "obsidian";

// Pure caption-text extraction lives in caption-logic.ts (no obsidian import, so it
// unit-tests in vitest, T-L6); re-exported here for convenience.
export { captionMarkdown, captionFromAlt } from "./caption-logic";

export interface CaptionHandle {
  el: HTMLElement;
  destroy(): void;
}

/**
 * Build the caption element (AB7) from already-resolved `text`: the alt text rendered
 * as Markdown via Obsidian's own renderer (AD9), placed BELOW the box as a child of
 * the embed/overlay. It is sized to the box width by PURE CSS (`.lie-caption { width:
 * 0; min-width:100% }` inside the shrink-wrapping `.lie-has-caption` host) — NO JS
 * width-sync / ResizeObserver (the old T-L10 hazard, designed out by the box's
 * explicit width). Returns null when there is no caption text; the caller MUST call
 * destroy() (unloads the Markdown component) when the image is torn down.
 */
export function createCaption(
  app: App,
  text: string,
  sourcePath: string
): CaptionHandle | null {
  if (!text) return null;

  const el = document.createElement("div");
  el.className = "lie-caption";
  el.setAttribute("contenteditable", "false");

  const component = new Component();
  component.load();
  void MarkdownRenderer.render(app, text, el, sourcePath, component);

  return {
    el,
    destroy(): void {
      component.unload();
    },
  };
}
