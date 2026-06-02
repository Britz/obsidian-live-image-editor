import {
  ImageTransform, FilterData, MARKER_CLASS, INLINE_CLASS,
  filterToVars, FILTER_VAR_NAMES,
} from "./transforms";
import { rotatedBox, cropBoxSize, estimatedBlockHeight } from "./renderer-logic";
import { SIZE_CLASS_MAX } from "./styles-injector";

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

  // R0 — ONE rendering path for EVERY image. Every image lives in the SAME real
  // `.lie-rotate-box` (no `display:contents` special case): the box is JS-sized to the
  // visible bounding box and the image is transformed inside it. "Normal" is the
  // degenerate case (deg 0, scale 1) handled by the exact same `reserveBox` as a
  // quarter-turn; only CROP differs, because it genuinely clips a sub-region (a
  // different operation, not a special-cased "normal"). The structure never branches.
  const box = ensureBox(img);
  box.classList.remove("lie-box-crop");
  box.removeAttribute("style");
  img.style.transform = "";
  img.style.transformOrigin = "";
  img.style.width = "";
  img.style.height = "";

  if (t.crop) {
    box.classList.add("lie-box-crop");
    applyCrop(img, box, t);
  } else {
    // Normal / 180° / quarter-turn / flip / filter — all the same path. deg 0 ⇒ the
    // box is the image's own size; a quarter-turn ⇒ the rotated bounding box.
    reserveBox(img, t.rotate ?? 0, t);
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

// The single sizing path for every non-cropped image (R0). Measures the column,
// sizes the box to the visible bounding box of the (rotated/flipped/scaled) image and
// centres the image inside it. deg 0 ⇒ the box is the image's own displayed size (a
// "normal" image); a quarter-turn ⇒ the rotated bounding box. Stays responsive via a
// ResizeObserver on the column.
function reserveBox(img: HTMLImageElement, deg: number, t: ImageTransform): void {
  const flips: string[] = [];
  if (t.flipH) flips.push("scaleX(-1)");
  if (t.flipV) flips.push("scaleY(-1)");

  // Reserve the height synchronously so the box is NEVER 0px tall while attached: it
  // sizes asynchronously (image load + measurable column), and a 0→full growth shifts
  // everything below it and lurches the scroll. The same estimate CM6 is told via the
  // widget's estimatedHeight (DRY) — the layout() loop below then refines it to the
  // exact measured size, turning a big jump into a small correction.
  ensureBox(img).style.height = `${estimatedBlockHeight({ crop: t.crop, width: t.width, height: t.height })}px`;

  let lastAvail = 0;
  const layout = (): boolean => {
    // Bail (and let the caller retry) until the image is in the DOM AND has both
    // intrinsic size and a measurable column width. Widgets call us during toDOM,
    // before CM attaches the element — at which point availableWidth() is 0 and a
    // one-shot attempt would silently leave the image without its box.
    if (!img.isConnected) return false;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    // Cap the available width by a preset size class (lie-small/medium/large) if
    // present — the box owns the size now (R0), so the class can't just clamp the img.
    const avail = Math.min(availableWidth(img), sizeCapFor(img));
    if (!nw || !nh || !avail || !isFinite(avail)) return false;

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

  // Retry every frame until layout() SUCCEEDS (the widget calls us during toDOM,
  // before CM attaches the element — so the column isn't measurable yet and the first
  // attempts are no-ops), THEN keep recomputing for a short settling window because
  // the column drifts to its final width over a few frames (Bug 2). A hard cap stops
  // a widget that never becomes measurable (e.g. rendered far off-screen) from
  // spinning — CM re-creates it (fresh reserveBox) when it scrolls into view. Only
  // after the retries do we wire up the ResizeObserver, since the element is attached
  // by then and the column is finally findable (it is NOT during toDOM — capturing it
  // there returned null and silently left the box unsized; the cause of a box stuck at
  // 0 on text-heavy pages where the element attaches after the old fixed window).
  // Separate the two waits so neither starves the other: `settled` counts frames AFTER
  // the box first lays out (the column drifts to its final width for a few frames —
  // Bug 2), `waited` counts frames spent waiting for the image/column to become
  // measurable at all. The image may be cached-but-not-yet-decoded with NO `load`
  // event coming (so we must NOT gate on naturalWidth — that left tick() never running
  // and the box stuck at 0), or rendered before CM attaches it. Give up only after a
  // long wait so a truly-offscreen widget doesn't spin forever (CM re-creates it on
  // scroll-in).
  const SETTLE_FRAMES = 30, MAX_WAIT = 600;
  let settled = 0, waited = 0;
  // Schedule the next attempt via BOTH requestAnimationFrame and a timer, whichever
  // fires first (guarded so only one runs). rAF is PAUSED while the window is
  // hidden/backgrounded (a second Obsidian window, an unfocused tab) — relying on it
  // alone leaves EVERY image's box stuck at 0 there (since R0 routes all images
  // through here, not just rotated ones); setTimeout still fires (throttled) in the
  // background, so the box sizes as soon as the column is measurable.
  const schedule = (): void => {
    let ran = false;
    const run = (): void => { if (ran) return; ran = true; tick(); };
    requestAnimationFrame(run);
    setTimeout(run, 100);
  };
  const tick = (): void => {
    if (layout()) {
      if (++settled >= SETTLE_FRAMES) { observeColumn(); return; }
    } else if (++waited >= MAX_WAIT) {
      observeColumn();
      return;
    }
    schedule();
  };

  // Stay responsive (D12): recompute when the column's available width actually
  // changes (window/pane resize). Width-guarded so the box's own height change can't
  // feedback-loop. Found here (post-retry) because the element is attached by now.
  const observeColumn = (): void => {
    rotateObservers.get(img)?.disconnect();
    const col = img.closest<HTMLElement>(
      ".cm-content, .markdown-preview-sizer, .markdown-source-view, .markdown-preview-view"
    );
    if (!col) return;
    const ro = new ResizeObserver(() => {
      if (!img.isConnected || !img.parentElement?.classList.contains("lie-rotate-box")) {
        ro.disconnect();
        return;
      }
      const avail = Math.min(availableWidth(img), sizeCapFor(img));
      if (avail && isFinite(avail) && Math.abs(avail - lastAvail) > 1) layout();
    });
    ro.observe(col);
    rotateObservers.set(img, ro);
  };

  // Always start the retry loop — do NOT gate on img.naturalWidth: a cached image can
  // be `complete` with naturalWidth momentarily 0 and NO `load` event coming, which
  // left the loop unstarted and the box at 0 (the Captions-page bug). tick() is a
  // no-op until the image and column are measurable.
  tick();
}

// The width cap (px) imposed by a preset size class on the image, or Infinity if
// none. Shared map with styles-injector so the value lives in one place.
function sizeCapFor(img: HTMLImageElement): number {
  let cap = Infinity;
  for (const cls of Object.keys(SIZE_CLASS_MAX)) {
    if (img.classList.contains(cls)) cap = Math.min(cap, SIZE_CLASS_MAX[cls] ?? Infinity);
  }
  return cap;
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
  // Box matches the SCALED cut (aspect-correct when only one dimension is given), so a
  // resized crop has no empty band and a caption sits right under it (Bug 2 for crops).
  const { w, h, scale } = cropBoxSize(crop, t.width, t.height);
  box.style.width = `${w}px`;
  box.style.height = `${h}px`;

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
