import {
  ImageTransform, Align, FilterData, MARKER_CLASS, INLINE_CLASS,
  getRotation, isCrop, filterToCss, getWidthPx, getHeightPx,
} from "./transforms";
import { boxAspectRatio, innerImageSize, rotatedAabb, isTallFloat } from "./renderer-logic";

// The Obsidian-FREE render core (AB7a). It builds the uniform 3-layer image structure and
// carries the structural render CSS as a STRING — the SINGLE source injected by BOTH the
// plugin (`styles-injector`) and the standalone runtime (`runtime.ts`), so the render is
// identical (R0). It imports only the framework-free model (`transforms`) + geometry
// (`renderer-logic`); NO obsidian / CodeMirror, so it bundles into the runtime cleanly.
//
// The uniform 3-layer image structure (R0/AD3). Outermost first:
//   OUTER  `.lie-image-area` — the FLOW FOOTPRINT: width / aspect-ratio / align / style /
//          .class. Axis-aligned, NEVER rotated, so the footprint stays correct even though
//          `transform` would not reflow. Carries the chrome anchor (`.lie-box` is its parent).
//   FRAME  `.lie-frame`      — ORIENTATION + CROP CLIP: rotate + flip composed about its
//          CENTRE (structural pivot — the Bug 25 fix), `overflow:hidden`.
//   <img>                    — CONTENT: the crop placement `transform` (pan/zoom + optional
//          content-rotate, verbatim AD2) and `filter`.
// Code keeps the structural "box" vocabulary for the outer (BOX_CLASS).
export const BOX_CLASS = "lie-image-area";
export const FRAME_CLASS = "lie-frame";

/**
 * Build the uniform 3-layer structure for a claimed `<img>` and render an ImageTransform
 * DECLARATIVELY (AD2/AD3) into it (normal = the degenerate transform). The SAME builder is
 * called by the plugin renderer and the portable runtime (AB7a — two callers, one builder).
 * ORIENTATION (`rotate`/`flip`) acts on the frame, composed about its centre, so re-orienting
 * an already-cropped image pivots structurally and never touches the crop placement on the
 * `<img>` (Bug 25). The crop placement + `filter` ride the `<img>` verbatim. Sizing runs one
 * way (outer → frame → image): the footprint's `aspect-ratio` is derived from the base shape
 * (the natural ratio, or the cut-frame shape for a crop) + the angle and applied to the DOM.
 */
export function buildLayers(img: HTMLImageElement, t: ImageTransform): void {
  resetLieState(img);

  const outer = ensureLayers(img);
  const frame = img.parentElement as HTMLElement; // `.lie-frame`

  // No marker class on the img: reconcile/selection identify our images by their
  // `.lie-image-area` outer (or the `.lie-inline` class). resetLieState strips a legacy marker.
  if (t.inline) img.classList.add(INLINE_CLASS);
  // Alignment is a FIELD (the bare `align=` key); re-derive the `lie-left/right/center` MARKER
  // class on the img so the injected `:has(img.lie-…)` float/centre rules still match. It is a
  // render-time marker (tracked in data-lie-classes, cleared on reset), never stored in source.
  const alignClass = t.align ? `lie-${t.align}` : null;
  // Tall-float cap (R0, cross-view): mark a FLOATED image whose estimated height exceeds the
  // CM6 render margin so the stylesheet stacks it as a non-floated block in safe mode.
  // Declarative (no DOM measure, AD6); tracked via applyClasses so reset/re-render clears it.
  const floated = t.align === "left" || t.align === "right";
  const tall = floated && isTallFloat({
    widthPx: getWidthPx(t), heightPx: getHeightPx(t),
    aspectRatio: t.aspectRatio ? parseRatio(t.aspectRatio) : null,
  });
  applyClasses(img, [...t.classes, ...(alignClass ? [alignClass] : []), ...(tall ? ["lie-tall"] : [])]);

  // IMG filter: native CSS, verbatim (AD2).
  img.style.filter = t.filter ?? "";

  // OUTER: route width / height / aspect-ratio / passthrough by property name (#5).
  routeBoxStyle(outer, t);

  // FRAME: orientation (rotate + flip) composed about the centre — STRUCTURAL pivot.
  applyOrientation(frame, t);

  // Sizing from the base shape (intrinsic ratio, or the cut-frame shape for a crop) + angle,
  // applied to the DOM. Read once on load; no column measurement, no retry-on-resize loop.
  sizeLayers(img, outer, frame, t);
}

// Apply passthrough + the footprint props to the OUTER. For a NON-crop an explicit
// `aspect-ratio` is set inline (overriding the derived `--lie-auto-aspect`); explicit
// width+height (distortion) makes CSS ignore the aspect. For a CROP the footprint shape is
// the CUT shape, which is driven by `--lie-auto-aspect` (cut ratio + angle) so it swaps on a
// rotate — so width/height/aspect-ratio are NOT set here (sizeLayers owns them, AD6).
function routeBoxStyle(outer: HTMLElement, t: ImageTransform): void {
  if (t.box) for (const [k, v] of Object.entries(t.box)) outer.style.setProperty(k, v);
  if (isCrop(t)) return;
  if (t.width) outer.style.width = t.width;
  if (t.height) outer.style.height = t.height;
  if (t.aspectRatio) outer.style.aspectRatio = t.aspectRatio;
}

// Compose the frame's orientation about its centre. The frame sits at top/left:50% and is
// centred with a STRUCTURAL `translate(-50%,-50%)` (plugin-generated, NOT a user value — the
// crop placement on the <img> stays a clean verbatim string, AD2), then rotated/flipped about
// the centre (transform-origin:center in CSS). flip ∘ rotate reaches all eight orientations.
function applyOrientation(frame: HTMLElement, t: ImageTransform): void {
  const parts = ["translate(-50%, -50%)"];
  if (t.rotate) parts.push(`rotate(${t.rotate}deg)`);
  if (t.flipH) parts.push("scaleX(-1)");
  if (t.flipV) parts.push("scaleY(-1)");
  frame.style.transform = parts.join(" ");
}

// Size the frame (the base shape rotated, as a % of the outer) and the outer's derived
// aspect-ratio, then place the inner image. A CROP positions the source within the frame
// (the cut-frame coordinate space); everything else fills the frame, which the orientation
// then rotates. The frame's `overflow:hidden` clips uniformly (crop is not a structural fork).
function sizeLayers(img: HTMLImageElement, outer: HTMLElement, frame: HTMLElement, t: ImageTransform): void {
  const deg = getRotation(t);

  if (isCrop(t)) {
    // The source fills the frame's width (the cut-frame baseline), keeps its aspect, and is
    // CENTRED in the frame statically (inset:0 + margin:auto — never mixed into the transform
    // string, AD2); the crop placement then pans/zooms/ROTATES it about its CENTRE
    // (transform-origin:center) — the same origin the in-place editor uses, so a rotate pivots
    // intuitively and editor == render (Bug 32 A). The frame (+ its orientation) does the rest.
    img.style.top = "0";
    img.style.left = "0";
    img.style.right = "0";
    img.style.bottom = "0";
    img.style.margin = "auto";
    img.style.transformOrigin = "center";
    img.style.transform = t.transform ?? "";
    img.style.width = "100%";
    img.style.height = "auto";
    // Footprint: shape from the CUT ratio + angle (swaps on a rotate); width = the stored cut
    // width rotated into the footprint (deg=0 → the cut width itself). A non-px width (preset
    // var) can't be rotated — set it as-is (rare).
    const cut = cropAspect(t) ?? 1;
    shapeFrame(outer, frame, cut, deg);
    const cutW = getWidthPx(t);
    if (cutW) outer.style.width = `${Math.round(rotatedAabb(cutW, cutW / cut, deg).w)}px`;
    else if (t.width) outer.style.width = t.width;
    return;
  }

  // Non-crop: the img fills the frame (the orientation lives on the frame, about its centre).
  // Centred statically (inset:0 + margin:auto) — same as the crop case, so a power-user content
  // transform also pivots about the centre and the placement string stays free of centering.
  img.style.top = "0";
  img.style.left = "0";
  img.style.right = "0";
  img.style.bottom = "0";
  img.style.margin = "auto";
  img.style.transformOrigin = "center";
  img.style.transform = t.transform ?? ""; // usually empty; a power-user content transform passes through
  img.style.width = "100%";
  img.style.height = "100%";

  const apply = (): boolean => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return false;
    shapeFrame(outer, frame, nw / nh, deg);
    // A default width only when NEITHER dimension is set — the box shows at the image's
    // natural (rotated) size, column-capped.
    if (!t.width && !t.height) outer.style.width = `${Math.round(rotatedAabb(nw, nh, deg).w)}px`;
    return true;
  };

  if (apply()) return;
  // Intrinsic size not known yet: give the outer a PROVISIONAL aspect-ratio so it can't
  // collapse to 0 height; the frame fills it until the real ratio lands.
  outer.style.setProperty("--lie-auto-aspect", t.aspectRatio || "1");
  frame.style.width = "100%";
  frame.style.height = "100%";
  const onLoad = (): void => { apply(); };
  img.addEventListener("load", onLoad, { once: true });
  let tries = 0;
  const poll = (): void => { if (apply() || ++tries > 20 || !img.isConnected) return; window.setTimeout(poll, 50); };
  window.setTimeout(poll, 0);
}

// Derive the outer's footprint aspect-ratio and the frame's size (% of the outer) from a base
// shape (w/h ratio) + the angle. The base shape is the natural ratio (non-crop) or the
// cut-frame shape (crop): for a quarter-turn the footprint swaps and the frame is the base
// rect that, once rotated, fills the swapped footprint — uniform for crop and non-crop (AD3).
function shapeFrame(outer: HTMLElement, frame: HTMLElement, baseShape: number, deg: number): void {
  outer.style.setProperty("--lie-auto-aspect", String(boxAspectRatio(baseShape, deg)));
  const inner = innerImageSize(baseShape, deg);
  frame.style.width = `${inner.w}%`;
  frame.style.height = `${inner.h}%`;
}

// The cut-frame aspect (w/h) for a crop: from a stored `aspect-ratio` (T2.3, the target), else
// from an explicit width+height px (legacy crop), else null.
function cropAspect(t: ImageTransform): number | null {
  const fromAr = parseRatio(t.aspectRatio);
  if (fromAr) return fromAr;
  const w = getWidthPx(t), h = getHeightPx(t);
  return w && h ? w / h : null;
}

// Parse a CSS `aspect-ratio` value ("4/3", "1.5", "16 / 9") into a number, or null.
function parseRatio(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/);
  if (!m) return null;
  const a = parseFloat(m[1] ?? "");
  const b = m[2] ? parseFloat(m[2]) : 1;
  return a > 0 && b > 0 ? a / b : null;
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
  // Remove the layout/decoration classes WE added last render (tracked in data-lie-classes) so
  // a class dropped from the {…} block doesn't stick on a reused (Obsidian-cached) image.
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
  img.style.top = "";
  img.style.left = "";
  img.style.right = "";
  img.style.bottom = "";
  img.style.margin = "";
  // Clear the inline styles on the wrapping frame + outer (reused DOM), so a transform dropped
  // from the block doesn't linger.
  let el = img.parentElement;
  for (let i = 0; i < 2 && el; i++) {
    if (el.classList.contains(FRAME_CLASS) || el.classList.contains(BOX_CLASS)) {
      el.removeAttribute("style");
      el = el.parentElement;
    } else break;
  }
}

// Remove the wrapping layers entirely (when an image leaves our control — a cached
// reading-view embed whose source no longer has a {…} block). Handles the 3-layer structure
// and a legacy 2-layer (`.lie-image-area > img`) reused DOM.
export function unwrapBox(img: HTMLImageElement): void {
  const parent = img.parentElement;
  if (!parent) return;
  if (parent.classList.contains(FRAME_CLASS)) {
    const outer = parent.parentElement;
    const top = outer?.classList.contains(BOX_CLASS) ? outer : parent;
    top.parentElement?.insertBefore(img, top);
    top.remove();
    return;
  }
  if (parent.classList.contains(BOX_CLASS)) { // legacy 2-layer
    parent.parentElement?.insertBefore(img, parent);
    parent.remove();
  }
}

// The uniform 3-layer wrapper (T5/R0). Idempotent; upgrades a reused legacy 2-layer DOM
// (`.lie-image-area > img`) by inserting the frame. Returns the OUTER.
function ensureLayers(img: HTMLImageElement): HTMLElement {
  const parent = img.parentElement;
  // Already a frame whose parent is the outer → done.
  if (parent && parent.classList.contains(FRAME_CLASS)) {
    const outer = parent.parentElement;
    if (outer && outer.classList.contains(BOX_CLASS)) return outer;
  }
  // Legacy 2-layer (outer > img): insert a frame between them.
  if (parent && parent.classList.contains(BOX_CLASS)) {
    const frame = document.createElement("span");
    frame.classList.add(FRAME_CLASS);
    parent.insertBefore(frame, img);
    frame.appendChild(img);
    return parent;
  }
  // Fresh build: outer > frame > img.
  const outer = document.createElement("span");
  outer.classList.add(BOX_CLASS);
  const frame = document.createElement("span");
  frame.classList.add(FRAME_CLASS);
  parent?.insertBefore(outer, img);
  outer.appendChild(frame);
  frame.appendChild(img);
  return outer;
}

// Layout/decoration classes go on the IMG so the `:has(img.lie-*)` rules on the embed match
// (Bug 11). Recorded in data-lie-classes so resetLieState clears exactly these.
function applyClasses(img: HTMLImageElement, classes: string[]): void {
  const clean = classes.filter(Boolean); // never classList.add("") — empty token throws
  for (const cls of clean) img.classList.add(cls);
  if (clean.length) img.dataset["lieClasses"] = clean.join(" ");
  else delete img.dataset["lieClasses"];
}

// ---------------------------------------------------------------------------
// Structural render CSS (AB7a) — the SINGLE source for the 3-layer LAYER rules, injected at
// runtime by BOTH the plugin (`styles-injector`) and the standalone runtime, so the image
// renders identically in Obsidian and on a foreign page (R0). It is ONLY the layer geometry;
// the Obsidian embed-integration, native-suppression, reveal, tall-float cap, alignment hosts
// and all chrome stay with their adapter (plugin `styles.css` / `styles-injector`; the runtime
// injects its own alignment host). `--lie-auto-aspect` is set inline per image by buildLayers.
// ---------------------------------------------------------------------------
export const RENDER_CSS = `
.lie-image-area {
  display: inline-block;
  position: relative;
  overflow: hidden;
  max-width: 100%;
  aspect-ratio: var(--lie-auto-aspect, auto);
  line-height: 0;
  vertical-align: bottom;
}
.lie-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  overflow: hidden;
  transform-origin: center;
}
.lie-frame > img {
  position: absolute;
  max-width: none !important;
}
img.lie-inline { vertical-align: middle; }
.lie-image-area:has(img.lie-inline) { vertical-align: middle; }
`;

// ---------------------------------------------------------------------------
// Identification (AB7a) — claim an `<img>` IFF it carries a distinctive transform key
// (`rotate`/`flip`/`transform`/`aspect-ratio`) OR the explicit `.lie` marker; `align`/`width`/
// `style`/`class` ALONE do not claim (native CSS already handles them). Recognises both the
// bare keys (python-markdown / Material) and the `data-`-prefixed Pandoc variants.
// ---------------------------------------------------------------------------
export const CLAIM_SELECTOR =
  "[rotate],[flip],[transform],[aspect-ratio],.lie," +
  "[data-rotate],[data-flip],[data-transform],[data-aspect-ratio]";

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(`data-${name}`);
}

/**
 * Read an ImageTransform from a claimed element's ATTRIBUTES (the foreign-page form, where the
 * `{…}` block lands as HTML attributes). The same model the `{…}` parser produces, so the core
 * builder renders it identically. Bare keys + their `data-`-prefixed Pandoc variants.
 */
export function readTransform(el: HTMLElement): ImageTransform {
  const t: ImageTransform = { classes: [] };

  const rotate = attr(el, "rotate");
  if (rotate != null) { const d = parseFloat(rotate); if (!Number.isNaN(d)) t.rotate = d; }
  const flip = attr(el, "flip");
  if (flip) for (const f of flip.split(/[\s,]+/).filter(Boolean)) {
    if (f === "horizontal" || f === "h") t.flipH = true;
    else if (f === "vertical" || f === "v") t.flipV = true;
    else if (f === "both") { t.flipH = true; t.flipV = true; }
  }
  const transform = attr(el, "transform"); if (transform) t.transform = transform;
  const filter = attr(el, "filter"); if (filter) t.filter = filter;
  const ar = attr(el, "aspect-ratio"); if (ar) t.aspectRatio = ar;
  const width = el.getAttribute("width") ?? el.getAttribute("data-width");
  if (width) t.width = /^\d+(?:\.\d+)?$/.test(width.trim()) ? `${width.trim()}px` : width.trim();
  const align = el.getAttribute("align") ?? el.getAttribute("data-align");
  if (align === "left" || align === "right" || align === "center") t.align = align as Align;

  for (const c of Array.from(el.classList)) {
    if (c === "lie" || c === MARKER_CLASS) continue;          // claim markers — not real classes
    if (c === INLINE_CLASS) { t.inline = true; continue; }
    if (c === "lie-left") { t.align = "left"; continue; }     // tolerate legacy align classes
    if (c === "lie-right") { t.align = "right"; continue; }
    if (c === "lie-center") { t.align = "center"; continue; }
    t.classes.push(c);
  }
  return t;
}
