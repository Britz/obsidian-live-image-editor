import {
  ImageTransform, FilterData, MARKER_CLASS, INLINE_CLASS,
  filterToVars, FILTER_VAR_NAMES,
} from "./transforms";
import { rotatedBox } from "./renderer-logic";

// Every CSS custom property the renderer may set — cleared on reset so a reused
// (Obsidian-cached) element can't keep stale values.
const LIE_VARS = ["--lie-rotate", "--lie-flip-h", "--lie-flip-v", ...FILTER_VAR_NAMES];

/**
 * Render an ImageTransform declaratively: set the `.lie-img` marker class plus
 * `--lie-*` CSS custom properties, and let the injected `.lie-img` CSS rule do
 * the rotation/flip/filter — the same way the markdown renders in MkDocs. The
 * only imperative parts are those that genuinely need runtime measurement (the
 * quarter-turn reflow) or geometry not expressible as a single value (crop).
 */
export function applyTransformToImage(img: HTMLImageElement, t: ImageTransform): void {
  resetLieState(img);

  // Mark anything we touch (incl. size) so reconciliation can tell our state
  // from a native Obsidian resize and never wipe the latter.
  const marked = !!(t.rotate || t.flipH || t.flipV || hasFilter(t.filter) || t.crop || t.width || t.height);
  if (marked) img.classList.add(MARKER_CLASS);
  if (t.inline) img.classList.add(INLINE_CLASS);

  setTransformVars(img, t);
  setFilterVars(img, t.filter);

  // CONSISTENT DOM STRUCTURE (T-L7): EVERY image lives in the SAME `.lie-rotate-box`
  // wrapper — normal, rotated or cropped alike. Only the CSS differs per state (via
  // a modifier class); the structure never branches.
  const box = ensureBox(img);
  box.classList.remove("lie-box-rotate", "lie-box-crop");
  box.removeAttribute("style");
  img.style.transform = "";
  img.style.transformOrigin = "";

  if (t.crop) {
    // Cropped: the box clips a compound-transformed image (modifier CSS + inline
    // transform, which overrides the var-based `.lie-img` transform).
    box.classList.add("lie-box-crop");
    applyCrop(img, box, t);
  } else if (t.rotate && t.rotate % 180 !== 0) {
    // Quarter turn: the box reserves the measured rotated bounding box; t.width is
    // the BOUNDING-box width, so it's owned by the box, not pinned on the img.
    box.classList.add("lie-box-rotate");
    img.style.width = "";
    img.style.height = "";
    reserveRotatedBox(img, t.rotate, t);
  } else {
    // Normal / 180° / flip / filter: the box is layout-transparent (CSS
    // display:contents) and the image keeps native (or explicit) sizing.
    img.style.width = t.width ? `${t.width}px` : "";
    img.style.height = t.height ? `${t.height}px` : "";
  }

  applyClasses(img, t.classes);
}

function setTransformVars(img: HTMLImageElement, t: ImageTransform): void {
  if (t.rotate) img.style.setProperty("--lie-rotate", `${t.rotate}deg`);
  if (t.flipH) img.style.setProperty("--lie-flip-h", "-1");
  if (t.flipV) img.style.setProperty("--lie-flip-v", "-1");
}

function setFilterVars(img: HTMLImageElement, filter?: FilterData): void {
  for (const { name, value } of filterToVars(filter)) {
    img.style.setProperty(name, value);
  }
}

/**
 * Apply ONLY the filter custom properties to a live image — the filter panel's
 * preview path. Decoupled from the document round-trip so a slider changes the
 * pixels immediately (and never depends on the embed being re-rendered). Clears
 * stale filter vars first, and ensures the `.lie-img` marker so the injected CSS
 * rule (which consumes the vars) is active.
 */
export function applyFilterVars(img: HTMLImageElement, filter?: FilterData): void {
  for (const name of FILTER_VAR_NAMES) img.style.removeProperty(name);
  setFilterVars(img, filter);
  if (filterToVars(filter).length) img.classList.add(MARKER_CLASS);
}

function resetLieState(img: HTMLImageElement): void {
  rotateObservers.get(img)?.disconnect();
  rotateObservers.delete(img);
  img.classList.remove(MARKER_CLASS, INLINE_CLASS);
  // Remove the layout/decoration classes WE added on the previous render (tracked in
  // data-lie-classes) so a class dropped from the {…} block doesn't stay stuck on a
  // reused (Obsidian-cached) image. Classes from other sources are left untouched.
  const prevClasses = img.dataset["lieClasses"];
  if (prevClasses) {
    for (const c of prevClasses.split(" ")) if (c) img.classList.remove(c);
    delete img.dataset["lieClasses"];
  }
  for (const v of LIE_VARS) img.style.removeProperty(v);
  img.style.transform = "";
  img.style.transformOrigin = "";
  img.style.width = "";
  img.style.height = "";
  // The `.lie-rotate-box` wrapper is intentionally KEPT (consistent structure,
  // T-L7) — applyTransformToImage reconfigures it (modifier class + style) each
  // time, so there's nothing to unwrap.
}

// Remove the wrapper entirely (only when an image leaves our control — e.g. a
// cached reading-view embed whose source no longer has a {…} block). Used by the
// reconcile's stale-clear path so untouched images don't keep an empty wrapper.
export function unwrapBox(img: HTMLImageElement): void {
  const parent = img.parentElement;
  if (parent && parent.classList.contains("lie-rotate-box")) {
    parent.parentElement?.insertBefore(img, parent);
    parent.remove();
  }
}

function hasFilter(f?: FilterData): boolean {
  return filterToVars(f).length > 0;
}

// Per-image ResizeObserver for the rotate box, so it can be disconnected when the
// image is reset/unwrapped (avoids leaks and stale recomputes).
const rotateObservers = new WeakMap<HTMLImageElement, ResizeObserver>();

function reserveRotatedBox(img: HTMLImageElement, deg: number, t: ImageTransform): void {
  const flips: string[] = [];
  if (t.flipH) flips.push("scaleX(-1)");
  if (t.flipV) flips.push("scaleY(-1)");

  let lastAvail = 0;
  const layout = (): boolean => {
    // Bail (and let the caller retry) until the image is in the DOM AND has both
    // intrinsic size and a measurable column width. Widgets call us during toDOM,
    // before CM attaches the element — at which point availableWidth() is 0 and a
    // one-shot attempt would silently leave the rotated image without its box.
    if (!img.isConnected) return false;

    // Use the intrinsic pixel size, NOT offsetWidth: once our wrapper shrinks
    // the embed, offsetWidth reads that shrunk size and the result collapses to
    // a few px (feedback loop). naturalWidth/Height are stable.
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const avail = availableWidth(img);
    if (!nw || !nh || !avail) return false;

    // Displayed size = the image fit to the column width (images are max-width:100%).
    const dispW = Math.min(nw, avail);
    const dispH = (dispW * nh) / nw;

    // Bounding box of the rotated image. A user-set width (t.width) is the target
    // bounding-box width — so the resize handle works on rotated images too; else
    // it falls back to the natural extent. Both capped at the column width.
    const { bw, bh, scale } = rotatedBox(dispW, dispH, deg, avail, t.width);

    const wrapper = ensureBox(img);
    img.style.width = `${Math.round(dispW)}px`;
    img.style.height = `${Math.round(dispH)}px`;
    img.style.transformOrigin = "center center";
    img.style.transform = ["translate(-50%, -50%)", `rotate(${deg}deg)`, ...flips, `scale(${scale})`].join(" ");
    wrapper.style.width = `${Math.round(bw)}px`;
    wrapper.style.height = `${Math.round(bh)}px`;
    lastAvail = avail;
    return true;
  };

  // Recompute EVERY frame across the whole window (not just until the first
  // success): the column keeps settling to its final width for several frames after
  // it first becomes measurable, and stopping at the first success locks the box at
  // a transient (too-narrow) width (Bug 2). layout() is idempotent and a no-op while
  // not yet measurable, so this is safe; the ResizeObserver below then handles any
  // later (pane/window) resizes.
  const tryLayout = (attemptsLeft: number): void => {
    layout();
    if (attemptsLeft > 0) requestAnimationFrame(() => tryLayout(attemptsLeft - 1));
  };

  if (img.naturalWidth) {
    tryLayout(60);
  } else {
    img.addEventListener("load", () => tryLayout(60), { once: true });
  }

  // Stay responsive (D12): the FIRST measurement can land before the column has its
  // final width (transiently narrower → box stuck too small), and the column also
  // changes on window/pane resize. Recompute when the available width actually
  // changes. Width-guarded so the box's own height change can't feedback-loop.
  rotateObservers.get(img)?.disconnect();
  const col = img.closest<HTMLElement>(
    ".cm-content, .markdown-preview-sizer, .markdown-source-view, .markdown-preview-view"
  );
  if (col) {
    const ro = new ResizeObserver(() => {
      if (!img.isConnected || !img.parentElement?.classList.contains("lie-rotate-box")) {
        ro.disconnect();
        return;
      }
      const avail = availableWidth(img);
      if (avail && Math.abs(avail - lastAvail) > 1) layout();
    });
    ro.observe(col);
    rotateObservers.set(img, ro);
  }
}

// The width a max-width:100% image actually gets here, so a rotated image's box
// matches a normal one to the pixel. Measure the COLUMN block (cm-line / sizer),
// NOT the embed's .image-wrapper — the wrapper shrink-wraps its content (so the
// resize handle sits on the image, Bug 12), which would make it report the image's
// own width instead of the available column (Bug 2). Subtract padding, since
// percentage widths resolve against the content box, not the padding box.
function availableWidth(el: HTMLElement): number {
  // Measure the COLUMN block only. NO fallback to the parent: during the widget's
  // initial construction the image's parent (.image-wrapper) can be a transient,
  // too-narrow width — using it locked the rotate box too small (Bug 2). Returning
  // 0 makes the caller retry until the real column is measurable.
  const block = el.closest<HTMLElement>(
    ".cm-content, .markdown-preview-sizer, .markdown-source-view, .markdown-preview-view"
  );
  if (!block) return 0;
  const cs = getComputedStyle(block);
  return block.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
}

// The single, always-present wrapper (T-L7). Every image is wrapped in the SAME
// `.lie-rotate-box` span; the per-state CSS lives in modifier classes. Idempotent.
function ensureBox(img: HTMLImageElement): HTMLElement {
  const parent = img.parentElement;
  if (parent && parent.classList.contains("lie-rotate-box")) {
    return parent;
  }
  const box = document.createElement("span");
  box.classList.add("lie-rotate-box");
  parent?.insertBefore(box, img);
  box.appendChild(img);
  return box;
}

// Configure the (already-present) box for cropping: clip a compound-transformed
// image to the cut box. Same structure as every other image, different CSS.
function applyCrop(img: HTMLImageElement, box: HTMLElement, t: ImageTransform): void {
  const crop = t.crop!;
  const displayW = t.width ?? crop.w;
  const displayH = t.height ?? crop.h;
  box.style.display = t.inline ? "inline-block" : "block";
  box.style.width = `${displayW}px`;
  box.style.height = `${displayH}px`;

  const scale = Math.min(displayW / crop.w, displayH / crop.h);
  const transforms: string[] = [`translate(${-crop.x * scale}px, ${-crop.y * scale}px)`];
  if (crop.rotate) transforms.push(`rotate(${crop.rotate}deg)`);
  transforms.push(`scale(${crop.scale * scale})`);
  if (t.flipH) transforms.push("scaleX(-1)");
  if (t.flipV) transforms.push("scaleY(-1)");

  img.style.transform = transforms.join(" ");
  img.style.transformOrigin = "top left";
  img.style.width = "";
  img.style.height = "";
}

// Layout classes (alignment, decoration) go on the IMG, so the `:has(img.lie-*)`
// rules on the embed match in every state (Bug 11), regardless of the box. The set
// is recorded in data-lie-classes so resetLieState can clear exactly these next time.
function applyClasses(img: HTMLImageElement, classes: string[]): void {
  for (const cls of classes) img.classList.add(cls);
  if (classes.length) img.dataset["lieClasses"] = classes.join(" ");
  else delete img.dataset["lieClasses"];
}
