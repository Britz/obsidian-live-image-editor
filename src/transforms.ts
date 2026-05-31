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

export function parseAltText(alt: string): ImageTransform {
  const result: ImageTransform = { classes: [] };
  if (!alt || !alt.trim()) return result;

  const tokens = alt.trim().split(/\s+/);

  for (const token of tokens) {
    if (token === "flipH") {
      result.flipH = true;
    } else if (token === "flipV") {
      result.flipV = true;
    } else if (token === "inline") {
      result.inline = true;
    } else if (/^\d+x\d+$/.test(token)) {
      const [w, h] = token.split("x").map(Number);
      result.width = w;
      result.height = h;
    } else if (/^\d+$/.test(token)) {
      result.width = parseInt(token, 10);
    } else if (token.startsWith("rotate:")) {
      result.rotate = parseFloat(token.slice(7));
    } else if (token.startsWith("crop:")) {
      const parts = token.slice(5).split(",").map(Number);
      if (parts.length === 6) {
        result.crop = {
          x: parts[0] ?? 0, y: parts[1] ?? 0,
          w: parts[2] ?? 0, h: parts[3] ?? 0,
          rotate: parts[4] ?? 0, scale: parts[5] ?? 1,
        };
      }
    } else if (token.startsWith("brightness:")) {
      if (!result.filter) result.filter = {};
      result.filter.brightness = parseFloat(token.slice(11));
    } else if (token.startsWith("contrast:")) {
      if (!result.filter) result.filter = {};
      result.filter.contrast = parseFloat(token.slice(9));
    } else if (token.startsWith("saturate:")) {
      if (!result.filter) result.filter = {};
      result.filter.saturate = parseFloat(token.slice(9));
    } else if (token.startsWith("hue:")) {
      if (!result.filter) result.filter = {};
      result.filter.hueRotate = parseFloat(token.slice(4));
    } else if (token.startsWith("blur:")) {
      if (!result.filter) result.filter = {};
      result.filter.blur = parseFloat(token.slice(5));
    } else if (token.startsWith("grayscale:")) {
      if (!result.filter) result.filter = {};
      result.filter.grayscale = parseFloat(token.slice(10));
    } else if (token.startsWith("sepia:")) {
      if (!result.filter) result.filter = {};
      result.filter.sepia = parseFloat(token.slice(6));
    } else {
      result.classes.push(token);
    }
  }

  return result;
}

export function serializeTransform(t: ImageTransform): string {
  const parts: string[] = [];

  if (t.width && t.height) {
    parts.push(`${t.width}x${t.height}`);
  } else if (t.width) {
    parts.push(`${t.width}`);
  }

  if (t.rotate) parts.push(`rotate:${quantizeRotation(t.rotate)}`);
  if (t.flipH) parts.push("flipH");
  if (t.flipV) parts.push("flipV");
  if (t.inline) parts.push("inline");

  if (t.crop) {
    const c = t.crop;
    parts.push(`crop:${q(c.x)},${q(c.y)},${q(c.w)},${q(c.h)},${quantizeRotation(c.rotate)},${quantizeScale(c.scale)}`);
  }

  if (t.filter) {
    for (const key of FILTER_KEYS) {
      const val = t.filter[key];
      if (val !== undefined && val !== FILTER_DEFAULTS[key]) {
        const serialKey = key === "hueRotate" ? "hue" : key;
        parts.push(`${serialKey}:${quantizeFilter(val)}`);
      }
    }
  }

  parts.push(...t.classes);

  return parts.join(" ");
}

export function isDefaultFilter(f: FilterData): boolean {
  return FILTER_KEYS.every(k => f[k] === undefined || f[k] === FILTER_DEFAULTS[k]);
}

export function getFilterDefaults(): Required<FilterData> {
  return { ...FILTER_DEFAULTS };
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
