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

  // For a quarter-turn or crop the displayed size is owned by the wrapper/box
  // (reserveRotatedBox / wrapWithCropContainer), where t.width is the BOUNDING-BOX
  // width — so don't also pin it on the img here (that's the pre-rotation width and
  // would fight the reflow). Plain/180° images take the width directly.
  const sizesViaWrapper = !!(t.rotate && t.rotate % 180 !== 0) || !!t.crop;
  img.style.width = t.width && !sizesViaWrapper ? `${t.width}px` : "";
  img.style.height = t.height && !sizesViaWrapper ? `${t.height}px` : "";

  if (t.crop) {
    // Crop needs a clipping wrapper + a compound transform → imperative. Its
    // inline transform overrides the var-based `.lie-img` transform.
    wrapWithCropContainer(img, t);
  } else if (t.rotate && t.rotate % 180 !== 0) {
    // Quarter turns need a measured bounding box, so the transform is set inline
    // here (overriding the declarative one) and the box is reserved in JS.
    reserveRotatedBox(img, t.rotate, t);
  }
  // 0°/180° + flips + filters need no JS — the `.lie-img` CSS renders them.

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
  img.classList.remove(MARKER_CLASS, INLINE_CLASS);
  for (const v of LIE_VARS) img.style.removeProperty(v);
  img.style.transform = "";
  img.style.transformOrigin = "";
  img.style.width = "";
  img.style.height = "";
  unwrapRotatedBox(img);
  unwrapCropContainer(img);
}

function hasFilter(f?: FilterData): boolean {
  return filterToVars(f).length > 0;
}

function reserveRotatedBox(img: HTMLImageElement, deg: number, t: ImageTransform): void {
  const flips: string[] = [];
  if (t.flipH) flips.push("scaleX(-1)");
  if (t.flipV) flips.push("scaleY(-1)");

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

    const wrapper = ensureRotateWrapper(img);
    img.style.width = `${Math.round(dispW)}px`;
    img.style.height = `${Math.round(dispH)}px`;
    img.style.transformOrigin = "center center";
    img.style.transform = ["translate(-50%, -50%)", `rotate(${deg}deg)`, ...flips, `scale(${scale})`].join(" ");
    wrapper.style.width = `${Math.round(bw)}px`;
    wrapper.style.height = `${Math.round(bh)}px`;
    return true;
  };

  // Retry across frames until the element is attached and measurable (~1s cap),
  // covering both the not-yet-loaded image and the not-yet-attached widget cases.
  const tryLayout = (attemptsLeft: number): void => {
    if (layout() || attemptsLeft <= 0) return;
    requestAnimationFrame(() => tryLayout(attemptsLeft - 1));
  };

  if (img.naturalWidth) {
    tryLayout(60);
  } else {
    img.addEventListener("load", () => tryLayout(60), { once: true });
  }
}

// The width a max-width:100% image actually gets here, so a rotated image's box
// matches a normal one to the pixel. The nearest real block is the embed's own
// .image-wrapper (full width at this point — the rotate-box that shrinks it is
// created AFTER this measurement); subtract its padding, since percentage widths
// resolve against the content box, not the padding box that clientWidth includes.
function availableWidth(el: HTMLElement): number {
  const block = el.closest<HTMLElement>(
    ".image-wrapper, .markdown-preview-sizer, .cm-line, .cm-content, .markdown-source-view, .markdown-preview-view"
  );
  const target = block ?? el.parentElement;
  if (!target) return 0;
  const cs = getComputedStyle(target);
  return target.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
}

function ensureRotateWrapper(img: HTMLImageElement): HTMLElement {
  const parent = img.parentElement;
  if (parent && parent.classList.contains("lie-rotate-box")) {
    return parent;
  }
  const wrapper = document.createElement("span");
  wrapper.classList.add("lie-rotate-box");
  parent?.insertBefore(wrapper, img);
  wrapper.appendChild(img);
  return wrapper;
}

function unwrapRotatedBox(img: HTMLImageElement): void {
  const parent = img.parentElement;
  if (parent && parent.classList.contains("lie-rotate-box")) {
    parent.parentElement?.insertBefore(img, parent);
    parent.remove();
  }
}

function wrapWithCropContainer(img: HTMLImageElement, t: ImageTransform): void {
  const crop = t.crop!;
  const container = document.createElement("div");
  container.classList.add("lie-crop-container");
  container.style.overflow = "hidden";
  container.style.display = t.inline ? "inline-block" : "block";

  const displayW = t.width ?? crop.w;
  const displayH = t.height ?? crop.h;
  container.style.width = `${displayW}px`;
  container.style.height = `${displayH}px`;

  const scaleX = displayW / crop.w;
  const scaleY = displayH / crop.h;
  const scale = Math.min(scaleX, scaleY);

  const transforms: string[] = [];
  transforms.push(`translate(${-crop.x * scale}px, ${-crop.y * scale}px)`);
  if (crop.rotate) transforms.push(`rotate(${crop.rotate}deg)`);
  transforms.push(`scale(${crop.scale * scale})`);
  if (t.flipH) transforms.push("scaleX(-1)");
  if (t.flipV) transforms.push("scaleY(-1)");

  img.style.transform = transforms.join(" ");
  img.style.transformOrigin = "top left";
  img.style.width = "";
  img.style.height = "";

  const parent = img.parentElement;
  if (!parent) return;
  parent.insertBefore(container, img);
  container.appendChild(img);
}

function unwrapCropContainer(img: HTMLImageElement): void {
  const parent = img.parentElement;
  if (parent && parent.classList.contains("lie-crop-container")) {
    parent.parentElement?.insertBefore(img, parent);
    parent.remove();
  }
}

function applyClasses(img: HTMLImageElement, classes: string[]): void {
  for (const cls of classes) {
    const target = img.parentElement?.classList.contains("lie-crop-container")
      ? img.parentElement
      : img;
    target.classList.add(cls);
  }
}
