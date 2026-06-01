export interface CropData {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  scale: number;
}

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
  width?: number;
  height?: number;
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
  crop?: CropData;
  filter?: FilterData;
  classes: string[];
  inline?: boolean;
}

// Marker class that activates the injected CSS which consumes the custom props.
export const MARKER_CLASS = "lie-img";
export const INLINE_CLASS = "lie-inline";

const FILTER_KEYS: (keyof FilterData)[] = [
  "brightness", "contrast", "saturate", "hueRotate", "blur", "grayscale", "sepia"
];

const FILTER_DEFAULTS: Required<FilterData> = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hueRotate: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

// CSS custom property <-> FilterData mapping (var name, unit suffix).
const FILTER_VARS: Record<keyof FilterData, { var: string; unit: string }> = {
  brightness: { var: "--lie-brightness", unit: "" },
  contrast: { var: "--lie-contrast", unit: "" },
  saturate: { var: "--lie-saturate", unit: "" },
  hueRotate: { var: "--lie-hue", unit: "deg" },
  blur: { var: "--lie-blur", unit: "px" },
  grayscale: { var: "--lie-grayscale", unit: "" },
  sepia: { var: "--lie-sepia", unit: "" },
};

/**
 * Parse the content of a trailing attr_list block (the text inside `{…}`) into
 * an ImageTransform. Understands `.class` tokens, `key=value` attrs and a
 * `style="…"` declaration carrying our `--lie-*` CSS custom properties.
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
      const [key, raw] = token.split("=");
      const val = (raw ?? "").replace(/^["']|["']$/g, "");
      if (key === "width") result.width = num(val);
      else if (key === "height") result.height = num(val);
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
    if (!prop) continue;

    switch (prop) {
      case "--lie-rotate": result.rotate = num(value); break;
      case "--lie-flip-h": if (num(value) === -1) result.flipH = true; break;
      case "--lie-flip-v": if (num(value) === -1) result.flipV = true; break;
      case "width": result.width = num(value); break;
      case "height": result.height = num(value); break;
      case "--lie-crop": {
        const p = value.split(/[\s,]+/).map(Number);
        if (p.length === 6) {
          result.crop = {
            x: p[0] ?? 0, y: p[1] ?? 0, w: p[2] ?? 0, h: p[3] ?? 0,
            rotate: p[4] ?? 0, scale: p[5] ?? 1,
          };
        }
        break;
      }
      default: {
        const filterKey = filterKeyForVar(prop);
        if (filterKey) {
          if (!result.filter) result.filter = {};
          result.filter[filterKey] = num(value);
        }
      }
    }
  }
}

function filterKeyForVar(prop: string): keyof FilterData | null {
  for (const key of FILTER_KEYS) {
    if (FILTER_VARS[key].var === prop) return key;
  }
  return null;
}

/**
 * Serialize an ImageTransform back into attr_list block content (without the
 * surrounding `{…}`). Produces e.g. `.lie-img style="--lie-rotate: 90deg;"`.
 */
export function serializeTransform(t: ImageTransform): string {
  const classes: string[] = [];
  const style: string[] = [];

  if (t.rotate) style.push(`--lie-rotate: ${quantizeRotation(t.rotate)}deg`);
  if (t.flipH) style.push("--lie-flip-h: -1");
  if (t.flipV) style.push("--lie-flip-v: -1");

  if (t.filter) {
    for (const key of FILTER_KEYS) {
      const val = t.filter[key];
      if (val !== undefined && val !== FILTER_DEFAULTS[key]) {
        const { var: name, unit } = FILTER_VARS[key];
        style.push(`${name}: ${quantizeFilter(val)}${unit}`);
      }
    }
  }

  if (t.crop) {
    const c = t.crop;
    style.push(`--lie-crop: ${q(c.x)} ${q(c.y)} ${q(c.w)} ${q(c.h)} ${quantizeRotation(c.rotate)} ${quantizeScale(c.scale)}`);
  }

  // The marker class drives the injected transform/filter CSS.
  if (t.rotate || t.flipH || t.flipV || hasFilter(t.filter) || t.crop) {
    classes.push(MARKER_CLASS);
  }
  if (t.inline) classes.push(INLINE_CLASS);
  classes.push(...t.classes);

  if (t.width) style.push(`width: ${q(t.width)}px`);
  if (t.height) style.push(`height: ${q(t.height)}px`);

  const parts = classes.map((c) => `.${c}`);
  if (style.length) parts.push(`style="${style.join("; ")};"`);

  return parts.join(" ");
}

/**
 * Temperature is not a stored filter — it's an approximation that NUDGES the
 * other sliders (F6). Given a baseline (the hue/saturate/brightness captured when
 * the temperature control is grabbed) and a temperature in [-100 (cool) .. 100
 * (warm)], return the adjusted hue/saturate/brightness. Warm rotates hue toward
 * orange and lifts saturation/brightness; cool does the opposite. Pure + testable.
 */
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

export function isDefaultFilter(f: FilterData): boolean {
  return FILTER_KEYS.every(k => f[k] === undefined || f[k] === FILTER_DEFAULTS[k]);
}

export function getFilterDefaults(): Required<FilterData> {
  return { ...FILTER_DEFAULTS };
}

export interface CssVar {
  name: string;
  value: string;
}

/**
 * The non-default filter values as concrete `--lie-*` CSS custom-property
 * assignments (with units). Single source of truth for the var<->value mapping,
 * shared by the renderer (DOM + canvas export) and the filter panel's live
 * preview — so a slider, a saved transform and the export all read identically.
 */
export function filterToVars(f?: FilterData): CssVar[] {
  if (!f) return [];
  const out: CssVar[] = [];
  for (const key of FILTER_KEYS) {
    const val = f[key];
    if (val !== undefined && val !== FILTER_DEFAULTS[key]) {
      const { var: name, unit } = FILTER_VARS[key];
      out.push({ name, value: `${val}${unit}` });
    }
  }
  return out;
}

// Every filter custom-property name — used to clear stale values before re-apply.
export const FILTER_VAR_NAMES: string[] = FILTER_KEYS.map((k) => FILTER_VARS[k].var);

function hasFilter(f?: FilterData): boolean {
  return !!f && !isDefaultFilter(f);
}

function num(value: string): number {
  return parseFloat(value);
}

function q(n: number): number {
  return Math.round(n);
}

function quantizeRotation(deg: number): number {
  return Math.round(deg * 10) / 10;
}

function quantizeScale(s: number): number {
  return Math.round(s * 1000) / 1000;
}

function quantizeFilter(val: number): number {
  return Math.round(val * 100) / 100;
}
