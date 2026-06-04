import {
  ImageTransform, FilterData, MARKER_CLASS, INLINE_CLASS,
  getRotation, isCrop, filterToCss, getWidthPx, getHeightPx,
} from "./transforms";
import { boxAspectRatio, innerImageSize, rotatedAabb, isTallFloat } from "./renderer-logic";

// The uniform image box (R0/AD3) — the element wrapping and transforming the <img>. Its
// CSS class is `lie-image-area` (the area the image occupies); the chrome container around
// it is `.lie-box`. Code keeps the structural "box" vocabulary (BOX_CLASS / ensureBox).
export const BOX_CLASS = "lie-image-area";

/**
 * Render an ImageTransform DECLARATIVELY (AD2/AD3): every image lives in the SAME
 * uniform `.lie-image-area` (normal = the degenerate transform), the box carries the
 * size (the one sizing direction: box → image, AD6), and the img carries its native
 * `transform`/`filter` VERBATIM. Sizing is derived from the image's INTRINSIC ratio
 * (read once on load) plus the angle and applied to the DOM — never measured from the
 * rendered box, so there is no measure-then-resize loop.
 */
export function applyTransformToImage(img: HTMLImageElement, t: ImageTransform): void {
  resetLieState(img);

  const box = ensureBox(img);

  // No marker class on the img: reconcile/selection identify our images by their
  // `.lie-image-area` box parent (or the `.lie-inline` class), so the `{…}` source never
  // needs an invisible hook class. resetLieState still strips a legacy marker defensively.
  if (t.inline) img.classList.add(INLINE_CLASS);
  // Tall-float cap (R0, cross-view): mark a FLOATED image whose estimated height exceeds the
  // CM6 render margin, so the stylesheet stacks it as a non-floated block in safe mode
  // (`body.lie-safe-tall-float`). Declarative (no DOM measure, AD6); tracked via applyClasses
  // so reset/re-render clears it. Identical decision in Live Preview and Reading view.
  const floated = t.classes.includes("lie-left") || t.classes.includes("lie-right");
  const tall = floated && isTallFloat({
    widthPx: getWidthPx(t), heightPx: getHeightPx(t),
    aspectRatio: t.aspectRatio ? parseFloat(t.aspectRatio) : null,
  });
  applyClasses(img, tall ? [...t.classes, "lie-tall"] : t.classes);

  // IMG filter: native CSS, verbatim (AD2). The transform + centering are set by
  // sizeFromIntrinsic (it differs for crop vs non-crop).
  img.style.filter = t.filter ?? "";

  // BOX: route width / height / aspect-ratio / passthrough by property name (#5).
  routeBoxStyle(box, t);

  // Derived sizing from the intrinsic ratio + angle, applied to the DOM box (not the
  // source). Read once on load; no column measurement, no retry-on-resize loop.
  sizeFromIntrinsic(img, box, t);
}

// Apply width/height/aspect-ratio + any passthrough declaration to the box. An
// explicit `aspect-ratio` is set inline so it overrides the derived `--lie-auto-aspect`
// default; explicit width+height (distortion / crop frame) makes CSS ignore aspect.
function routeBoxStyle(box: HTMLElement, t: ImageTransform): void {
  if (t.width) box.style.width = t.width;
  if (t.height) box.style.height = t.height;
  if (t.aspectRatio) box.style.aspectRatio = t.aspectRatio;
  if (t.box) for (const [k, v] of Object.entries(t.box)) box.style.setProperty(k, v);
}

// Size the box from the image's intrinsic ratio (the ground truth, T11) once it is
// known, and place the inner image in box-relative units. A crop keeps the explicit
// cut-frame size (width+height) and anchors the original top-left; everything else
// derives the box aspect-ratio (+ a default width when none is set) from the angle.
function sizeFromIntrinsic(img: HTMLImageElement, box: HTMLElement, t: ImageTransform): void {
  const deg = getRotation(t);
  const cropped = isCrop(t);

  if (cropped) {
    // The cut frame is the box (explicit width+height from routeBoxStyle); the original
    // fills the box width, keeps its aspect, and is positioned by the native transform
    // (top-left origin, no centering translate).
    img.style.top = "0";
    img.style.left = "0";
    img.style.transformOrigin = "top left";
    img.style.transform = t.transform ?? "";
    img.style.width = "100%";
    img.style.height = "auto";
    return;
  }

  // Non-crop: the img is absolute-CENTERED via `top/left:50% + translate(-50%,-50%)`
  // (works even when the rotated img is wider than the box, e.g. 150% at a quarter
  // turn — `margin:auto` would left-align it, Bug 6). The stored transform is composed
  // AFTER the centering translate (verbatim, AD2 — the source itself stays clean).
  img.style.top = "50%";
  img.style.left = "50%";
  img.style.transformOrigin = "center";
  img.style.transform = `translate(-50%, -50%) ${t.transform ?? ""}`.trim();

  const apply = (): boolean => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return false;
    const r = nw / nh;
    box.style.setProperty("--lie-auto-aspect", String(boxAspectRatio(r, deg)));
    // A default width only when NEITHER dimension is set — so the box shows at the
    // image's natural (rotated) size, column-capped. With an explicit height-only
    // (e.g. the icon preset) the box derives width from height × aspect-ratio.
    if (!t.width && !t.height) box.style.width = `${Math.round(rotatedAabb(nw, nh, deg).w)}px`;
    const inner = innerImageSize(r, deg);
    img.style.width = `${inner.w}%`;
    img.style.height = `${inner.h}%`;
    return true;
  };

  if (apply()) return;
  // Intrinsic size not known yet: give the box a PROVISIONAL aspect-ratio so it can't
  // collapse to 0 height (which made a rotated image vanish before load) — the stored
  // aspectRatio if any, else square. The img fills it until the real ratio lands.
  box.style.setProperty("--lie-auto-aspect", t.aspectRatio || "1");
  img.style.width = "100%";
  img.style.height = "100%";
  // A cached image can be `complete` with naturalWidth momentarily 0 and NO load event
  // (T-L10) — so also poll a FEW bounded times for the intrinsic size (this never
  // measures the column/box, so it is not the old measure-then-resize loop).
  const onLoad = (): void => { apply(); };
  img.addEventListener("load", onLoad, { once: true });
  let tries = 0;
  const poll = (): void => { if (apply() || ++tries > 20 || !img.isConnected) return; window.setTimeout(poll, 50); };
  window.setTimeout(poll, 0);
}

/**
 * The filter panel's live-preview path: set the img's native `filter` straight on the
 * DOM (decoupled from the document round-trip, so a slider changes the pixels at once).
 */
export function applyFilterPreview(img: HTMLImageElement, filter?: FilterData): void {
  img.style.filter = filter ? filterToCss(filter) : "";
}

function resetLieState(img: HTMLImageElement): void {
  img.classList.remove(MARKER_CLASS, INLINE_CLASS);
  // Remove the layout/decoration classes WE added last render (tracked in
  // data-lie-classes) so a class dropped from the {…} block doesn't stick on a reused
  // (Obsidian-cached) image. Classes from other sources are left untouched.
  const prev = img.dataset["lieClasses"];
  if (prev) {
    for (const c of prev.split(" ")) if (c) img.classList.remove(c);
    delete img.dataset["lieClasses"];
  }
  img.style.transform = "";
  img.style.filter = "";
  img.style.transformOrigin = "";
  img.style.width = "";
  img.style.height = "";
  const box = img.parentElement;
  if (box?.classList.contains(BOX_CLASS)) {
    box.removeAttribute("style");
  }
}

// Remove the wrapper entirely (when an image leaves our control — a cached reading-view
// embed whose source no longer has a {…} block).
export function unwrapBox(img: HTMLImageElement): void {
  const parent = img.parentElement;
  if (parent && parent.classList.contains(BOX_CLASS)) {
    parent.parentElement?.insertBefore(img, parent);
    parent.remove();
  }
}

// The single, always-present wrapper (T5/R0). Idempotent.
function ensureBox(img: HTMLImageElement): HTMLElement {
  const parent = img.parentElement;
  if (parent && parent.classList.contains(BOX_CLASS)) return parent;
  const box = document.createElement("span");
  box.classList.add(BOX_CLASS);
  parent?.insertBefore(box, img);
  box.appendChild(img);
  return box;
}

// Layout/decoration classes go on the IMG so the `:has(img.lie-*)` rules on the embed
// match (Bug 11). Recorded in data-lie-classes so resetLieState clears exactly these.
function applyClasses(img: HTMLImageElement, classes: string[]): void {
  const clean = classes.filter(Boolean); // never classList.add("") — empty token throws
  for (const cls of clean) img.classList.add(cls);
  if (clean.length) img.dataset["lieClasses"] = clean.join(" ");
  else delete img.dataset["lieClasses"];
}
