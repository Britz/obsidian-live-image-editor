import { App, Component, MarkdownRenderer } from "obsidian";

// Pure caption-text extraction lives in caption-logic.ts (no obsidian import, so it
// unit-tests in vitest, T-L6); re-exported here for convenience.
export { captionMarkdown, captionFromAlt } from "./caption-logic";

export interface CaptionHandle {
  el: HTMLElement;
  destroy(): void;
}

/**
 * Build the caption element from already-resolved caption `text`: rendered as Markdown
 * (italic/bold/links/… via Obsidian's own renderer, F13/D-caption), borderless and
 * centered BELOW the image (the caller stacks it under the image). It is sized to
 * never be wider than the image, so long captions wrap within the image width
 * instead of overflowing.
 *
 * The width is taken from the VISIBLE image box: the `.lie-rotate-box` when it has a
 * real width (rotated → bounding box; cropped → cut width), otherwise the `<img>`
 * itself (a normal image's box is `display: contents`, so it has no width). Kept in
 * sync via a ResizeObserver (responsive layout + the resize handle). Returns null
 * when the image has no caption text. The caller MUST call destroy() (unloads the
 * Markdown component, disconnects the observer) when the image is torn down.
 */
export function createCaption(
  app: App,
  text: string,
  sourcePath: string,
  img: HTMLImageElement
): CaptionHandle | null {
  if (!text) return null;

  const el = document.createElement("div");
  el.className = "lie-caption";
  el.setAttribute("contenteditable", "false");

  const component = new Component();
  component.load();
  // Render the alt text as Markdown into the caption block. void: the promise
  // resolves after the (synchronous for inline markup) render; no need to await.
  void MarkdownRenderer.render(app, text, el, sourcePath, component);

  const box = img.closest<HTMLElement>(".lie-rotate-box");
  const measure = (): number => {
    const bw = box ? box.getBoundingClientRect().width : 0;
    return bw || img.getBoundingClientRect().width;
  };
  const sync = (): void => {
    const w = measure();
    if (w > 0) el.style.width = `${Math.round(w)}px`;
  };
  sync();
  requestAnimationFrame(sync);

  // The box is sized asynchronously by reserveBox, and the ResizeObserver / rAF that
  // would normally catch it are PAUSED while the window is hidden/backgrounded — so
  // poll on a timer until the box has a measurable width, then stop. Without this the
  // caption keeps its natural (text) width and sits left-aligned instead of centred on
  // the image. Capped so a never-measurable (offscreen) image doesn't poll forever.
  let retries = 0;
  let timer = window.setTimeout(function retry() {
    sync();
    if (measure() <= 0 && ++retries < 60) timer = window.setTimeout(retry, 100);
  }, 0);

  // The visible width changes with the image (load, responsive column, resize
  // handle) and — for a rotated/cropped image — with its box. Observe both.
  const ro = new ResizeObserver(sync);
  ro.observe(img);
  if (box) ro.observe(box);

  const onLoad = (): void => sync();
  if (!img.complete) img.addEventListener("load", onLoad);

  return {
    el,
    destroy(): void {
      window.clearTimeout(timer);
      ro.disconnect();
      img.removeEventListener("load", onLoad);
      component.unload();
    },
  };
}
