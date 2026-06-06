// The transform model (AB1) — the single place that knows the trailing attr_list
// `{…}` block's syntax, identical for the Markdown and wikilink form (T2). The model is
// ROUTED PER LAYER (AD2/AD3, the 3-layer R0 structure): ORIENTATION (`rotate`/`flip`) acts
// on the inner-frame (composed about its centre), the crop PLACEMENT (`transform`) + the
// `filter` act on the <img> verbatim, and the footprint (`width`/`height`/`aspect-ratio`)
// acts on the outer. Separating orientation from the crop placement is what makes
// re-orienting an already-cropped image pivot structurally instead of drifting (Bug 50):
// the toolbar's rotate/flip set the orientation fields (frame), never the img transform.
// The target block format (T2.3) is bare keys (`rotate=`/`flip=`/`transform="…"`/`filter="…"`/
// `aspect-ratio=`); a legacy `style="transform: …"` is still read (back-compat).

// FilterData is the editor-facing decomposition of the native `filter` string — used
// only by the filter panel (sliders) and the export's canvas filter; the renderer
// never decomposes it (it routes the `filter` string whole to the img).
export interface FilterData {
  brightness?: number;
  contrast?: number;
  saturate?: number;
  hueRotate?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
}

export type Align = "left" | "right" | "center";

export interface ImageTransform {
  // Non-internal classes (decoration, vault snippets). Alignment is NOT here — it is the
  // `align` field (a bare key); legacy `.lie-left/right/center` classes parse INTO `align`.
  classes: string[];
  inline?: boolean;
  // Alignment → the OUTER/flow participant (AD3). Stored as the bare key `align=left|right|center`
  // (a real HTML attr → faithful fallback). The renderer re-derives the `lie-left/right/center`
  // marker class on the img so the `:has(img.lie-…)` float/centre rules still match.
  align?: Align;
  // ORIENTATION → the INNER-FRAME (AD3): rotate + flip composed about the frame centre, so
  // re-orienting a cropped image pivots structurally and never touches the crop placement on
  // the <img> (Bug 50). Stored as the bare keys `rotate=`/`flip=`, never inside the img
  // transform — that is the separation Bug 50 turns on.
  rotate?: number;   // degrees (quarter-turns or free)
  flipH?: boolean;
  flipV?: boolean;
  // CONTENT → the <img>, verbatim CSS (AD2). `transform` is the crop PLACEMENT only
  // (pan/zoom + optional content-rotate); `filter` the CSS filter. A power user's
  // skew()/extra filter functions pass through untouched.
  transform?: string;
  filter?: string;
  // OUTER (footprint). width/height are CSS length strings ("320px") or a preset var
  // ("var(--lie-size-medium)"); aspectRatio is the cut-frame shape, stored only when it
  // differs from the original (a crop ≠ original, a distorting resize, or a width+height modal).
  width?: string;
  height?: string;
  aspectRatio?: string;
  // Any other style declaration → the outer passthrough (routing rule (Decision 7)). Preserved so
  // hand-authored extras survive.
  box?: Record<string, string>;
}

export const MARKER_CLASS = "lie-img";
export const INLINE_CLASS = "lie-inline";

export const FILTER_KEYS: (keyof FilterData)[] = [
  "brightness", "contrast", "saturate", "hueRotate", "blur", "grayscale", "sepia",
];

const FILTER_DEFAULTS: Required<FilterData> = {
  brightness: 1, contrast: 1, saturate: 1, hueRotate: 0, blur: 0, grayscale: 0, sepia: 0,
};

// FilterData key ↔ native CSS filter function (name + unit). Single source for both
// directions of the mapping (parse ↔ stringify), so a slider, a stored filter and the
// canvas export read identically.
const FILTER_FNS: Record<keyof FilterData, { fn: string; unit: string }> = {
  brightness: { fn: "brightness", unit: "" },
  contrast: { fn: "contrast", unit: "" },
  saturate: { fn: "saturate", unit: "" },
  hueRotate: { fn: "hue-rotate", unit: "deg" },
  blur: { fn: "blur", unit: "px" },
  grayscale: { fn: "grayscale", unit: "" },
  sepia: { fn: "sepia", unit: "" },
};

// ---------------------------------------------------------------------------
// Parse / serialize the attr_list block content (without the surrounding `{…}`).
// ---------------------------------------------------------------------------

/**
 * Parse the content of a trailing attr_list block (the text inside `{…}`) into an
 * ImageTransform. Understands `.class` tokens and `key=value` attrs — the bare keys
 * `rotate` / `flip` (orientation → inner-frame), `transform` / `filter` (content → img),
 * `width` / `height` / `aspect-ratio` (footprint → outer) — plus a legacy `style="…"`
 * declaration carrying native CSS (back-compat: an old `transform: rotate(…) scaleX(-1)`
 * is decomposed into the orientation fields). `attrs` must be brace-LESS (Lesson 9).
 */
export function parseAltText(attrs: string): ImageTransform {
  const result: ImageTransform = { classes: [] };
  if (!attrs || !attrs.trim()) return result;

  // Pull out quoted key="…" / key='…' values first — their spaces would otherwise break
  // tokenizing (covers `transform=`/`filter=`/`style=` and any quoted value).
  let rest = attrs;
  const quoted = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const spans: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = quoted.exec(rest)) !== null) {
    applyKey(m[1] ?? "", m[2] ?? m[3] ?? "", result);
    spans.push([m.index, m.index + m[0].length]);
  }
  for (let i = spans.length - 1; i >= 0; i--) rest = rest.slice(0, spans[i]![0]) + rest.slice(spans[i]![1]);

  for (const token of rest.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith(".")) {
      const cls = token.slice(1);
      if (cls === MARKER_CLASS) continue;
      if (cls === INLINE_CLASS) { result.inline = true; continue; }
      const legacyAlign = LEGACY_ALIGN[cls];
      if (legacyAlign) { result.align = legacyAlign; continue; } // back-compat: class → align field
      result.classes.push(cls);
    } else if (token.startsWith("#")) {
      continue; // ids are not used by transforms
    } else if (token.includes("=")) {
      const eq = token.indexOf("=");
      applyKey(token.slice(0, eq), token.slice(eq + 1).replace(/^["']|["']$/g, ""), result);
    }
  }

  return result;
}

// Route one key=value into the model. The bare keys are the target format (T2.3); `style=`
// is the legacy / power-user escape, routed by CSS property name.
function applyKey(key: string, val: string, result: ImageTransform): void {
  const v = val.trim();
  switch (key) {
    case "style": parseStyle(v, result); break;
    case "transform": result.transform = v || undefined; break;
    case "filter": result.filter = v || undefined; break;
    case "rotate": { const d = parseFloat(v); if (!Number.isNaN(d)) result.rotate = d; break; }
    case "flip":
      for (const f of v.split(/[\s,]+/).filter(Boolean)) {
        if (f === "horizontal" || f === "h") result.flipH = true;
        else if (f === "vertical" || f === "v") result.flipV = true;
        else if (f === "both") { result.flipH = true; result.flipV = true; }
      }
      break;
    case "width": result.width = lengthValue(v); break;
    case "height": result.height = lengthValue(v); break;
    case "aspect-ratio": result.aspectRatio = v || undefined; break;
    case "align": if (v === "left" || v === "right" || v === "center") result.align = v; break;
    // other keys (id; …) are ignored.
  }
}

// Legacy alignment CLASS → the `align` field (back-compat; old notes still render unchanged).
const LEGACY_ALIGN: Record<string, Align | undefined> = {
  "lie-left": "left", "lie-right": "right", "lie-center": "center",
};

function parseStyle(style: string, result: ImageTransform): void {
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;

    switch (prop) {
      case "transform": assignLegacyTransform(value, result); break;
      case "filter": result.filter = value; break;
      case "width": result.width = value; break;
      case "height": result.height = value; break;
      case "aspect-ratio": result.aspectRatio = value; break;
      default: (result.box ??= {})[prop] = value; // routing rule (Decision 7)
    }
  }
}

// Back-compat: split a LEGACY `style="transform: …"` value — an orientation-only string
// (rotate/scaleX/scaleY, NO crop translate/scale) decomposes into the rotate/flipH/flipV
// fields (so it routes to the inner-frame like the new format); a crop placement (has
// translate or scale — incl. its content-rotate) stays whole on the <img>. A BARE
// `transform=` key is never decomposed (it is, by definition, the verbatim crop placement).
function assignLegacyTransform(value: string, result: ImageTransform): void {
  const fns = parseFns(value);
  if (fns.some((f) => f.name === "translate" || f.name === "scale")) {
    result.transform = value;
    return;
  }
  const kept: Fn[] = [];
  for (const f of fns) {
    if (f.name === "rotate") result.rotate = parseFloat(f.args) || 0;
    else if (f.name === "scaleX" && parseFloat(f.args) < 0) result.flipH = true;
    else if (f.name === "scaleY" && parseFloat(f.args) < 0) result.flipV = true;
    else kept.push(f);
  }
  result.transform = fnsToString(kept);
}

/**
 * Serialize an ImageTransform back into attr_list block content (without the surrounding
 * `{…}`). Bare-key format (T2.3): `align=` (outer), orientation `rotate=`/`flip=` (inner-frame),
 * the crop placement + filter `transform="…"`/`filter="…"` (img), the cut-frame shape
 * `aspect-ratio=` and `width=N` px (outer, a real HTML attr → faithful). A non-px width (var/%)
 * and any `height`/box passthrough keep the `style=` escape. Classes only for inline + the user's
 * own (decoration, snippets). No `.lie-img` marker (parseAltText still SKIPS it). Empty → "".
 */
export function serializeTransform(t: ImageTransform): string {
  const parts: string[] = [];
  if (t.inline) parts.push(`.${INLINE_CLASS}`);
  for (const c of t.classes) parts.push(`.${c}`);
  if (t.align) parts.push(`align=${t.align}`);
  if (t.rotate) parts.push(`rotate=${roundDeg(t.rotate)}`);
  if (t.flipH) parts.push("flip=horizontal");
  if (t.flipV) parts.push("flip=vertical");
  if (t.transform) parts.push(`transform="${t.transform}"`);
  if (t.filter) parts.push(`filter="${t.filter}"`);
  if (t.aspectRatio) parts.push(`aspect-ratio=${t.aspectRatio}`);
  // width=N as a bare key (a real HTML attr → faithful) ONLY for a literal px width; a preset is
  // baked to px so it qualifies. A var()/%/other width keeps the `style=` escape (no bare form).
  const widthPx = t.width && /^\d+(?:\.\d+)?px$/.test(t.width) ? t.width.slice(0, -2) : null;
  if (widthPx) parts.push(`width=${widthPx}`);

  const style: string[] = [];
  if (t.width && !widthPx) style.push(`width: ${t.width}`);
  if (t.height) style.push(`height: ${t.height}`);
  if (t.box) for (const [k, v] of Object.entries(t.box)) style.push(`${k}: ${v}`);
  if (style.length) parts.push(`style="${style.join("; ")}"`);
  return parts.join(" ");
}

function roundDeg(deg: number): string {
  return `${Math.round(deg * 10) / 10}`;
}

// A bare numeric value becomes a px length; an already-unit'd / var() value passes
// through (graceful with hand-edited source, T11).
function lengthValue(v: string): string {
  return /^\d+(\.\d+)?$/.test(v.trim()) ? `${v.trim()}px` : v.trim();
}

// ---------------------------------------------------------------------------
// Orientation (rotate/flip) is now a FIELD on the model (routed to the inner-frame),
// separate from the crop placement `transform` (the img). The toolbar's rotate/flip edit
// these fields and never the img transform — so re-orienting a cropped image can't drift
// it (Bug 50). `parseFns`/`fnsToString` remain for parsing the crop placement (isCrop, the
// legacy decompose, the crop editor's own reader).
// ---------------------------------------------------------------------------

interface Fn { name: string; args: string; }

function parseFns(s?: string): Fn[] {
  const out: Fn[] = [];
  if (!s) return out;
  const re = /([a-zA-Z][\w-]*)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push({ name: m[1] ?? "", args: (m[2] ?? "").trim() });
  return out;
}

function fnsToString(fns: Fn[]): string | undefined {
  return fns.length ? fns.map((f) => `${f.name}(${f.args})`).join(" ") : undefined;
}

/** The orientation rotation (deg, 0 if none) — applied to the inner-frame. */
export function getRotation(t: ImageTransform): number {
  return t.rotate ?? 0;
}

/** Set the orientation rotation (clearing it at 0). Never touches the crop placement. */
export function setRotation(t: ImageTransform, deg: number): void {
  t.rotate = deg ? deg : undefined;
}

export function getFlipH(t: ImageTransform): boolean { return !!t.flipH; }
export function getFlipV(t: ImageTransform): boolean { return !!t.flipV; }
export function toggleFlipH(t: ImageTransform): void { t.flipH = t.flipH ? undefined : true; }
export function toggleFlipV(t: ImageTransform): void { t.flipV = t.flipV ? undefined : true; }

/** A crop is the case where the img carries an explicit pan/zoom placement transform. */
export function isCrop(t: ImageTransform): boolean {
  return parseFns(t.transform).some((f) => f.name === "translate" || f.name === "scale");
}

// ---------------------------------------------------------------------------
// Native `filter` ↔ FilterData (only the filter panel + export decompose it).
// ---------------------------------------------------------------------------

export function getFilter(t: ImageTransform): FilterData {
  return parseFilterCss(t.filter);
}

export function setFilter(t: ImageTransform, f: FilterData | undefined): void {
  const css = f ? filterToCss(f) : "";
  t.filter = css || undefined;
}

export function parseFilterCss(s?: string): FilterData {
  const f: FilterData = {};
  if (!s) return f;
  const re = /([a-zA-Z-]+)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const fn = m[1] ?? "";
    const val = parseFloat(m[2] ?? "");
    if (Number.isNaN(val)) continue;
    for (const key of FILTER_KEYS) if (FILTER_FNS[key].fn === fn) f[key] = val;
  }
  return f;
}

// The filter reduced to its non-default keys — the single source of the "≠ default" predicate,
// shared by filterToCss, isDefaultFilter and the filter panel's commit (DRY).
export function nonDefaultFilter(f: FilterData): FilterData {
  const out: FilterData = {};
  for (const key of FILTER_KEYS) {
    const val = f[key];
    if (val !== undefined && val !== FILTER_DEFAULTS[key]) out[key] = val;
  }
  return out;
}

export function filterToCss(f: FilterData): string {
  const nd = nonDefaultFilter(f);
  return FILTER_KEYS
    .filter((key) => nd[key] !== undefined)
    .map((key) => `${FILTER_FNS[key].fn}(${quantizeFilter(nd[key] as number)}${FILTER_FNS[key].unit})`)
    .join(" ");
}

export function isDefaultFilter(f: FilterData): boolean {
  return Object.keys(nonDefaultFilter(f)).length === 0;
}

export function getFilterDefaults(): Required<FilterData> {
  return { ...FILTER_DEFAULTS };
}

// ---------------------------------------------------------------------------
// Size (width/height) helpers for the size sub-menu, export and normalization.
// ---------------------------------------------------------------------------

export const PRESET_KEYS = ["small", "medium", "large"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

/** The numeric px width if the width is a literal px value, else null (var/unset). */
export function getWidthPx(t: ImageTransform): number | null {
  return parsePx(t.width);
}
export function getHeightPx(t: ImageTransform): number | null {
  return parsePx(t.height);
}

function parsePx(v?: string): number | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d+(?:\.\d+)?)px$/);
  return m ? parseFloat(m[1] ?? "") : null;
}

export function setWidthPx(t: ImageTransform, px: number | null): void {
  t.width = px && px > 0 ? `${Math.round(px)}px` : undefined;
}
export function setHeightPx(t: ImageTransform, px: number | null): void {
  t.height = px && px > 0 ? `${Math.round(px)}px` : undefined;
}

function quantizeFilter(val: number): number {
  return Math.round(val * 100) / 100;
}
