import {
  ImageTransform, FilterData, MARKER_CLASS, INLINE_CLASS, ALIGN_TO_LAYOUT, LEGACY_ALIGN_CLASS,
  getRotation, isCrop, filterToCss, getWidthPx, getHeightPx,
} from "./transforms";
import { boxAspectRatio, innerImageSize, rotatedAabb, nativeBoxWidth, isTallFloat, rotatedFootprint } from "./renderer-logic";

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
//          CENTRE (structural pivot — the Bug 50 fix), `overflow:hidden`.
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
 * `<img>` (Bug 50). The crop placement + `filter` ride the `<img>` verbatim. Sizing runs one
 * way (outer → frame → image): the footprint's `aspect-ratio` is derived from the base shape
 * (the natural ratio, or the cut-frame shape for a crop) + the angle and applied to the DOM.
 */
export function buildLayers(img: HTMLImageElement, t: ImageTransform): void {
  resetLieState(img);

  const outer = ensureLayers(img);
  const frame = img.parentElement as HTMLElement; // `.lie-frame`

  // The inline marker (F17) rides the OUTER too (Decision 28): `.lie-image-area.lie-inline` sets the
  // mid-text vertical-align with a DIRECT selector, no `:has(img.lie-inline)`. Reconcile/selection
  // identify our images by the `.lie-image-area` outer. resetLieState strips a legacy marker off a
  // reused img (older versions put it on the img).
  if (t.layout === "inline") outer.classList.add(INLINE_CLASS);
  // Layout is a FIELD (the flat 6-state); re-derive the `lie-float-left|float-right|block-left|
  // block-center|block-right` MARKER on the OUTER (Decision 28 — markers ride the outer; inline uses
  // INLINE_CLASS above). On a foreign page the outer IS the flow participant, so the runtime floats/
  // blocks it with a DIRECT `.lie-image-area.lie-…` (no `:has`). In the plugin the layout must act on
  // the host ABOVE the outer, so styles.css keeps a `:has(.lie-image-area.lie-…)` on the host — the
  // tolerated CM-context `:has` (Decision 28). Render-time only, never stored.
  const layoutClass = t.layout && t.layout !== "inline" ? `lie-${t.layout}` : null;
  // Tall-float cap (R0, cross-view): mark a FLOATED image whose estimated height exceeds the
  // CM6 render margin so the stylesheet stacks it as a non-floated block in safe mode.
  // Declarative (no DOM measure, AD6); tracked so reset/re-render clears it.
  const floated = t.layout === "float-left" || t.layout === "float-right";
  const tall = floated && isTallFloat({
    widthPx: getWidthPx(t), heightPx: getHeightPx(t),
    aspectRatio: t.aspectRatio ? parseRatio(t.aspectRatio) : null,
  });
  // Everything the {…} block carries rides the OUTER (AD2/AD3, Decision 28): the user/decoration
  // classes, the alignment marker and the tall-float marker — so a decoration class styles the
  // un-clipped footprint box, and the markers are selected directly (runtime) or via a host `:has`
  // on the outer (plugin). One tracked set (`data-lie-classes`) so reset clears exactly these.
  applyTrackedClasses(outer, [...t.classes, ...(layoutClass ? [layoutClass] : []), ...(tall ? ["lie-tall"] : [])], "lieClasses");

  // IMG filter: native CSS, verbatim (AD2).
  img.style.filter = t.filter ?? "";

  // OUTER: route width / height / aspect-ratio / passthrough by property name (Decision 7).
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
    // intuitively and editor == render (Bug 51 A). The frame (+ its orientation) does the rest.
    // The static centring + width fill now live in the `.lie-frame > img` rule (RENDER_CSS /
    // styles.css). A crop keeps the source's native aspect (height:auto) vs. a non-crop's
    // height:100% fill — expressed by the `lie-crop-fit` marker class (`.lie-frame > img.lie-crop-fit`
    // in CSS). Only the per-image crop placement transform stays inline (dynamic, AD2).
    img.style.transform = t.transform ?? "";
    img.classList.add("lie-crop-fit");
    // Footprint: shape from the CUT ratio + angle (swaps on a rotate); width = the stored cut
    // width rotated into the footprint (deg=0 → the cut width itself). A non-px width (preset
    // var) can't be rotated — set it as-is (rare).
    const cut = cropAspect(t) ?? 1;
    shapeFrame(outer, frame, cut, deg);
    const cutW = getWidthPx(t);
    if (cutW) outer.style.width = `${Math.round(rotatedAabb(cutW, cutW / cut, deg).w)}px`;
    else if (t.width) outer.style.width = t.width;
    else {
      // No explicit width (cropped, width removed): route through the SAME native box-sizing
      // path as a non-crop image — the box must NOT collapse to 0 just because its content is
      // absolutely positioned (Bug 78). The footprint shape stays the CUT shape (set above); the
      // box width falls back to the ORIGINAL intrinsic dimension on the rotation-correct axis
      // (`rotatedAabb` swaps to the original HEIGHT for a 90°/270° box), column-capped by the
      // `max-width:100%` rule. Needs the natural size — wait for it (the crop transform is
      // already applied above, so the live image is correct while we resolve the cap).
      whenNatural(img, (nw, nh) => {
        outer.style.width = `${nativeBoxWidth(nw, nh, deg)}px`;
      });
    }
    return;
  }

  // Non-crop: the img fills the frame (the orientation lives on the frame, about its centre).
  // Centred statically (inset:0 + margin:auto) — same as the crop case, so a power-user content
  // transform also pivots about the centre and the placement string stays free of centering.
  // The static centring + 100% fill (img and frame) now live in `.lie-frame > img` / `.lie-frame`
  // (RENDER_CSS / styles.css); only the per-image (usually empty) content transform stays inline.
  img.style.transform = t.transform ?? ""; // usually empty; a power-user content transform passes through

  // Give the outer a PROVISIONAL aspect-ratio up front so it can't collapse to 0 height while the
  // intrinsic ratio is still unknown; the frame fills it (the `.lie-frame` 100%/100% default) until
  // the real ratio lands and shapeFrame writes the computed percentages.
  outer.style.setProperty("--lie-auto-aspect", t.aspectRatio || "1");

  // Footprint sizing is ROTATION-AWARE (Bug 90). The stored width/height are the image's BASE
  // (unrotated) footprint, so a quarter-turn must SWAP them — a 400×200 image rotated 90° is 200×400,
  // mirroring the crop path's rotatedAabb. routeBoxStyle applied the UNROTATED values; here we
  // override the px axes with the rotated footprint. (A non-px width like a preset var can't be
  // rotated numerically — left as routeBoxStyle set it.)
  const wPx = getWidthPx(t), hPx = getHeightPx(t);
  if (wPx != null && hPx != null) {
    const box = rotatedFootprint({ widthPx: wPx, heightPx: hPx, naturalRatio: null, deg });
    if (box.width != null) outer.style.width = `${box.width}px`;
    if (box.height != null) outer.style.height = `${box.height}px`;
  }
  // An explicit aspect-ratio (rare for a non-crop image) likewise swaps on a quarter-turn so the box
  // shape rotates with the image; at 0°/180° it is unchanged so routeBoxStyle's value stands.
  if (t.aspectRatio) {
    const r = parseRatio(t.aspectRatio);
    if (r) { const swapped = boxAspectRatio(r, deg); if (swapped !== r) outer.style.aspectRatio = String(swapped); }
  }

  whenNatural(img, (nw, nh) => {
    shapeFrame(outer, frame, nw / nh, deg);
    if (!t.width && !t.height) {
      // No explicit dimension → the image's natural (rotated) size, column-capped (the SAME native
      // cap the no-width crop path uses).
      outer.style.width = `${nativeBoxWidth(nw, nh, deg)}px`;
    } else if (wPx != null && hPx == null) {
      // Width only (height derives from the swapped --lie-auto-aspect): rotate the base footprint so
      // a 400-wide/200-tall box becomes 200-wide/400-tall on a quarter-turn (Bug 90).
      const box = rotatedFootprint({ widthPx: wPx, heightPx: null, naturalRatio: nw / nh, deg });
      if (box.width != null) outer.style.width = `${box.width}px`;
    } else if (hPx != null && wPx == null) {
      // Height only: symmetric to width-only (Bug 90).
      const box = rotatedFootprint({ widthPx: null, heightPx: hPx, naturalRatio: nw / nh, deg });
      if (box.height != null) outer.style.height = `${box.height}px`;
    }
  });
}

// Run `cb` with the image's intrinsic dimensions once they're known: synchronously if the image
// is already decoded, otherwise on load and via a short poll (a cached/backgrounded image may
// never fire `load`). Bails if the image leaves the document. Pure-ish DOM glue shared by the
// crop and non-crop sizing paths so the no-explicit-width native cap is derived identically.
function whenNatural(img: HTMLImageElement, cb: (nw: number, nh: number) => void): void {
  const tryApply = (): boolean => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return false;
    cb(nw, nh);
    return true;
  };
  if (tryApply()) return;
  img.addEventListener("load", () => { tryApply(); }, { once: true });
  let tries = 0;
  const poll = (): void => { if (tryApply() || ++tries > 20 || !img.isConnected) return; window.setTimeout(poll, 50); };
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
  // Clear any LEGACY tracked classes/markers on the IMG — older versions (and a Part-1 intermediate)
  // tracked the user classes / alignment markers on the img before they ALL moved to the OUTER
  // (Decision 28). Clearing both migrates a reused (Obsidian-cached) img cleanly; the OUTER's current
  // tracked set is cleared in the walk-up below.
  clearTracked(img, "lieMarkers");
  clearTracked(img, "lieClasses");
  // Clear the per-image inline styles buildLayers sets (filter/transform) and the crop-fit marker;
  // the static centring/sizing lives in CSS now, so nothing else is set inline on the img.
  img.style.removeProperty("transform");
  img.style.removeProperty("filter");
  img.classList.remove("lie-crop-fit");
  // Clear the wrapping frame + outer (reused DOM): the inline styles, AND the user/decoration
  // classes we added to the OUTER (data-lie-classes) so a class dropped from the block doesn't
  // linger on the reused outer.
  let el = img.parentElement;
  for (let i = 0; i < 2 && el; i++) {
    if (el.classList.contains(FRAME_CLASS) || el.classList.contains(BOX_CLASS)) {
      if (el.classList.contains(BOX_CLASS)) { clearTracked(el, "lieClasses"); el.classList.remove(INLINE_CLASS); }
      el.removeAttribute("style");
      el = el.parentElement;
    } else break;
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
    const frame = activeDocument.createElement("span");
    frame.classList.add(FRAME_CLASS);
    parent.insertBefore(frame, img);
    frame.appendChild(img);
    return parent;
  }
  // Fresh build: outer > frame > img.
  const outer = activeDocument.createElement("span");
  outer.classList.add(BOX_CLASS);
  const frame = activeDocument.createElement("span");
  frame.classList.add(FRAME_CLASS);
  parent?.insertBefore(outer, img);
  outer.appendChild(frame);
  frame.appendChild(img);
  return outer;
}

// Apply WE-added classes to `el` and record them under `el.dataset[key]` so reset clears EXACTLY
// these on a reused (Obsidian-cached) element — a class dropped from the {…} block must not stick.
// User/decoration classes go on the OUTER (key `lieClasses`, Decision 28); the alignment/tall
// markers go on the IMG (key `lieMarkers`) for the host float `:has` (Bug 10).
function applyTrackedClasses(el: HTMLElement, classes: string[], key: string): void {
  const clean = classes.filter(Boolean); // never classList.add("") — empty token throws
  for (const cls of clean) el.classList.add(cls);
  if (clean.length) el.dataset[key] = clean.join(" ");
  else delete el.dataset[key];
}

// Remove + untrack the classes recorded under `el.dataset[key]`.
function clearTracked(el: HTMLElement, key: string): void {
  const prev = el.dataset[key];
  if (!prev) return;
  for (const c of prev.split(" ")) if (c) el.classList.remove(c);
  delete el.dataset[key];
}

// ---------------------------------------------------------------------------
// Structural render CSS (AB7a) — the SINGLE source for the 3-layer LAYER rules. The STANDALONE
// runtime injects this string verbatim via a `<style>` (a foreign page has no Obsidian-loaded
// stylesheet). The PLUGIN does NOT inject it — Obsidian loads the plugin's `styles.css`, which
// carries a byte-identical copy of this block (kept in sync by a unit test, so the render is
// identical in Obsidian and on a foreign page — R0). It is ONLY the layer geometry; the Obsidian
// embed-integration, native-suppression, reveal, tall-float cap, alignment hosts and all chrome
// stay with their adapter (plugin `styles.css`; the runtime injects its own alignment host).
// Per-image values are set inline by buildLayers: `--lie-auto-aspect` (footprint shape) on the
// outer and the dynamic `transform`/`filter` on the img; the crop-vs-non-crop height difference is
// the `lie-crop-fit` marker class on the img.
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
  width: 100%;
  height: 100%;
  overflow: hidden;
  transform-origin: center;
}
.lie-frame > img {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: auto;
  width: 100%;
  height: 100%;
  transform-origin: center;
  max-width: none !important;
}
.lie-frame > img.lie-crop-fit { height: auto; }
.lie-image-area.lie-inline { vertical-align: middle; }
`;

// Caption CSS for the STANDALONE RUNTIME (D9). The plugin gets the equivalent rules from its
// auto-loaded styles.css (where the caption host is `.lie-box`); off-Obsidian the runtime wraps the
// image-area in a `.lie-has-caption` shrink-wrap host and injects this. The host is the caption's
// containing block, so `width:0; min-width:100%` sizes the caption to the image width with NO JS
// width-sync (D9). The host carries the layout marker (moved off the outer, Decision 28) so a
// captioned image still floats/centres — as the host, not the image alone. Theme vars get plain
// fallbacks since a foreign page has no Obsidian theme.
export const CAPTION_CSS = `
.lie-has-caption { display: inline-flex; flex-direction: column; align-items: stretch; }
.lie-caption {
  display: block;
  width: 0;
  min-width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  text-align: center;
  font-size: var(--font-smaller, 0.85em);
  color: var(--text-muted, #888);
  line-height: var(--line-height-tight, 1.3);
}
.lie-caption > :first-child { margin-top: 0; }
.lie-caption > :last-child { margin-bottom: 0; }
.lie-caption p { margin: 0; overflow-wrap: anywhere; }
.lie-caption img { max-width: 100%; }
.lie-has-caption.lie-float-left { float: left; clear: none; margin: 0 1em 0.5em 0; }
.lie-has-caption.lie-float-right { float: right; clear: none; margin: 0 0 0.5em 1em; }
.lie-has-caption.lie-block-left { display: flex; width: fit-content; margin-right: auto; }
.lie-has-caption.lie-block-center { display: flex; width: fit-content; margin-left: auto; margin-right: auto; }
.lie-has-caption.lie-block-right { display: flex; width: fit-content; margin-left: auto; }
`;

// ---------------------------------------------------------------------------
// Identification (AB7a) — claim an `<img>` IFF it carries a distinctive RUNTIME-ONLY key
// (`rotate`/`flip`/`transform`/`aspect-ratio`/`filter`) OR a non-native LAYOUT (the `.lie-inline`
// class, `align=center`, or any `align=block-*`) OR the explicit `.lie` marker. `align=left|right`
// (FLOAT) is genuinely HTML-faithful — a browser floats `<img align=left>` — so it does NOT claim,
// matching `width`/`style`/`class` (native CSS handles them). The block/center/inline states have
// NO faithful HTML attr (browser ignores them), so the runtime must claim to lay them out (fixes the
// center-only-not-centered gap, Bug 76; extends it to block-left/right + inline).
// A bare `filter=` is runtime-only — a browser ignores the bare attribute, so the runtime must
// claim it to apply the CSS filter; the optional `style="filter:…"` escape needs no runtime.
// Recognises both the bare keys (python-markdown / Material) and the `data-`-prefixed Pandoc variants.
// ---------------------------------------------------------------------------
export const CLAIM_SELECTOR =
  "[rotate],[flip],[transform],[aspect-ratio],[filter],.lie,.lie-inline," +
  '[align="center"],[align^="block-"],[data-align="center"],[data-align^="block-"],' +
  "[data-rotate],[data-flip],[data-transform],[data-aspect-ratio],[data-filter]";

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
  const height = el.getAttribute("height") ?? el.getAttribute("data-height");
  if (height) t.height = /^\d+(?:\.\d+)?$/.test(height.trim()) ? `${height.trim()}px` : height.trim();
  const align = el.getAttribute("align") ?? el.getAttribute("data-align");
  if (align) { const l = ALIGN_TO_LAYOUT[align]; if (l) t.layout = l; }

  for (const c of Array.from(el.classList)) {
    if (c === "lie" || c === MARKER_CLASS) continue;          // claim markers — not real classes
    if (c === INLINE_CLASS) { t.layout = "inline"; continue; }
    const legacy = LEGACY_ALIGN_CLASS[c];
    if (legacy) { t.layout = legacy; continue; }              // tolerate legacy align classes
    t.classes.push(c);
  }
  return t;
}
