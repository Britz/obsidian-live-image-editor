// The transform model (AB1) — the single place that knows the trailing attr_list
// `{…}` block's syntax, identical for the Markdown and wikilink form (T2). Transforms
// are stored as NATIVE CSS (AD2): `transform` / `filter` declarations pass through
// VERBATIM to the <img>, `width` / `height` / `aspect-ratio` route to the box. There
// is no `--lie-*` custom-property layer and no separate crop type — "one uniform
// geometry" (R0): crop is just the case where the otherwise-identity translate/scale
// of the img's native `transform` becomes explicit.

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

export interface ImageTransform {
  // Non-internal classes (alignment lie-left/right/center, decoration, vault snippets).
  classes: string[];
  inline?: boolean;
  // Routed to the IMG, verbatim native CSS (AD2). A power user's skew()/extra filter
  // functions pass through untouched.
  transform?: string;
  filter?: string;
  // Routed to the BOX. width/height are CSS length strings ("320px") or a preset var
  // ("var(--lie-size-medium)"); aspectRatio is a deliberate, non-derivable aspect
  // change (a distorting resize, a width+height modal, or an off-original crop frame).
  width?: string;
  height?: string;
  aspectRatio?: string;
  // Any other style declaration → the box (routing rule #5: everything but
  // transform/filter goes to the box). Preserved so hand-authored extras survive.
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
 * ImageTransform. Understands `.class` tokens, `key=value` attrs and a `style="…"`
 * declaration carrying NATIVE CSS. `params` must be brace-LESS (T-L9).
 */
export function parseAltText(attrs: string): ImageTransform {
  const result: ImageTransform = { classes: [] };
  if (!attrs || !attrs.trim()) return result;

  // Pull out style="…" / style='…' first so its spaces don't break tokenizing.
  let rest = attrs;
  const styleMatch = rest.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  if (styleMatch) {
    parseStyle(styleMatch[1] ?? styleMatch[2] ?? "", result);
    rest = rest.slice(0, styleMatch.index) + rest.slice((styleMatch.index ?? 0) + styleMatch[0].length);
  }

  for (const token of rest.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith(".")) {
      const cls = token.slice(1);
      if (cls === MARKER_CLASS) continue;
      if (cls === INLINE_CLASS) { result.inline = true; continue; }
      result.classes.push(cls);
    } else if (token.startsWith("#")) {
      continue; // ids are not used by transforms
    } else if (token.includes("=")) {
      const eq = token.indexOf("=");
      const key = token.slice(0, eq);
      const val = token.slice(eq + 1).replace(/^["']|["']$/g, "");
      if (key === "width") result.width = lengthValue(val);
      else if (key === "height") result.height = lengthValue(val);
    }
  }

  return result;
}

function parseStyle(style: string, result: ImageTransform): void {
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;

    switch (prop) {
      case "transform": result.transform = value; break;
      case "filter": result.filter = value; break;
      case "width": result.width = value; break;
      case "height": result.height = value; break;
      case "aspect-ratio": result.aspectRatio = value; break;
      default: (result.box ??= {})[prop] = value; // routing rule #5
    }
  }
}

/**
 * Serialize an ImageTransform back into attr_list block content (without the
 * surrounding `{…}`). Native CSS in `style=`, internal classes only for inline. No marker
 * class is emitted (a bare embed renders fine via the block widget). Empty transform →
 * empty string (so no `{…}` block is written).
 */
export function serializeTransform(t: ImageTransform): string {
  const style: string[] = [];
  if (t.transform) style.push(`transform: ${t.transform}`);
  if (t.filter) style.push(`filter: ${t.filter}`);
  if (t.width) style.push(`width: ${t.width}`);
  if (t.height) style.push(`height: ${t.height}`);
  if (t.aspectRatio) style.push(`aspect-ratio: ${t.aspectRatio}`);
  if (t.box) for (const [k, v] of Object.entries(t.box)) style.push(`${k}: ${v}`);

  // No `.lie-img` marker (parseAltText still SKIPS it, so old `{.lie-img …}` notes still
  // parse — backward-compat). Only the inline class + the user's own classes are emitted.
  const classes: string[] = [];
  if (t.inline) classes.push(INLINE_CLASS);
  classes.push(...t.classes);

  const parts = classes.map((c) => `.${c}`);
  if (style.length) parts.push(`style="${style.join("; ")}"`);
  return parts.join(" ");
}

// A bare numeric value becomes a px length; an already-unit'd / var() value passes
// through (graceful with hand-edited source, T11).
function lengthValue(v: string): string {
  return /^\d+(\.\d+)?$/.test(v.trim()) ? `${v.trim()}px` : v.trim();
}

// ---------------------------------------------------------------------------
// Native `transform` manipulation — the editor extracts/edits only the one
// function it touches and leaves the rest (incl. crop's translate/scale and any
// power-user functions) intact (implementation-plan §2.2).
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

/** The quarter/free rotation currently applied to the img (deg, 0 if none). */
export function getRotation(t: ImageTransform): number {
  const fn = parseFns(t.transform).find((f) => f.name === "rotate");
  return fn ? parseFloat(fn.args) || 0 : 0;
}

/** Set the rotate() function (removing it at 0), preserving every other function. */
export function setRotation(t: ImageTransform, deg: number): void {
  const fns = parseFns(t.transform);
  const i = fns.findIndex((f) => f.name === "rotate");
  if (deg) {
    const nf: Fn = { name: "rotate", args: `${deg}deg` };
    if (i >= 0) fns[i] = nf; else fns.unshift(nf);
  } else if (i >= 0) {
    fns.splice(i, 1);
  }
  t.transform = fnsToString(fns);
}

export function getFlipH(t: ImageTransform): boolean { return hasFlip(t, "scaleX"); }
export function getFlipV(t: ImageTransform): boolean { return hasFlip(t, "scaleY"); }
export function toggleFlipH(t: ImageTransform): void { toggleFlip(t, "scaleX"); }
export function toggleFlipV(t: ImageTransform): void { toggleFlip(t, "scaleY"); }

function hasFlip(t: ImageTransform, name: "scaleX" | "scaleY"): boolean {
  return parseFns(t.transform).some((f) => f.name === name && parseFloat(f.args) < 0);
}

function toggleFlip(t: ImageTransform, name: "scaleX" | "scaleY"): void {
  const fns = parseFns(t.transform);
  const i = fns.findIndex((f) => f.name === name && parseFloat(f.args) < 0);
  if (i >= 0) fns.splice(i, 1); else fns.push({ name, args: "-1" });
  t.transform = fnsToString(fns);
}

/** A crop is the case where the img's native transform carries an explicit pan/zoom. */
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

export function filterToCss(f: FilterData): string {
  const parts: string[] = [];
  for (const key of FILTER_KEYS) {
    const val = f[key];
    if (val !== undefined && val !== FILTER_DEFAULTS[key]) {
      parts.push(`${FILTER_FNS[key].fn}(${quantizeFilter(val)}${FILTER_FNS[key].unit})`);
    }
  }
  return parts.join(" ");
}

export function isDefaultFilter(f: FilterData): boolean {
  return FILTER_KEYS.every((k) => f[k] === undefined || f[k] === FILTER_DEFAULTS[k]);
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

/** The preset (small/medium/large) if the width is a preset var, else null. */
export function getPreset(t: ImageTransform): PresetKey | null {
  const m = t.width?.match(/^var\(--lie-size-(small|medium|large)\)$/);
  return (m?.[1] as PresetKey) ?? null;
}

export function setWidthPx(t: ImageTransform, px: number | null): void {
  t.width = px && px > 0 ? `${Math.round(px)}px` : undefined;
}
export function setHeightPx(t: ImageTransform, px: number | null): void {
  t.height = px && px > 0 ? `${Math.round(px)}px` : undefined;
}

/** A preset width via the re-themeable CSS var (falls back to auto without the plugin). */
export function setPresetWidth(t: ImageTransform, preset: PresetKey | null): void {
  t.width = preset ? `var(--lie-size-${preset})` : undefined;
}

// ---------------------------------------------------------------------------
// Temperature — a virtual control (F11) that NUDGES hue/saturate/brightness; never
// stored on its own. Pure + testable.
// ---------------------------------------------------------------------------

export function temperatureAdjust(
  base: { hueRotate: number; saturate: number; brightness: number },
  temp: number
): { hueRotate: number; saturate: number; brightness: number } {
  const t = Math.max(-100, Math.min(100, temp)) / 100;
  const hue = ((base.hueRotate + t * 30) % 360 + 360) % 360;
  const saturate = clampNum(base.saturate * (1 + t * 0.2), 0, 3);
  const brightness = clampNum(base.brightness * (1 + t * 0.08), 0, 2);
  return {
    hueRotate: Math.round(hue),
    saturate: quantizeFilter(saturate),
    brightness: quantizeFilter(brightness),
  };
}

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function quantizeFilter(val: number): number {
  return Math.round(val * 100) / 100;
}
