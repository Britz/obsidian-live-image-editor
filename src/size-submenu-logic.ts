import { PresetWidths } from "./styles-injector";
import { TranslationKey } from "./i18n";

// The working size state the size sub-menu holds and the owner reads on commit. Size is now
// ORTHOGONAL to layout (the flat 6-state lives on `ImageTransform.layout`, set via the layout
// buttons) — the size menu only touches width/height. width/height: CSS length strings or null
// (unset). width null + height null == "Original".
export interface SizeState {
  width: string | null;
  height: string | null;
}

// One-tap size preset (F24). small/medium/large BAKE the configured px width (faithful → the
// bare width=N key, not setting-reactive); ICON sets a line-height height (pair it with the
// inline layout state for an in-text icon); original clears everything back to the natural width.
export interface SizePreset {
  key: string;
  labelKey: TranslationKey;
  width: string | null;
  height: string | null;
}

export function sizePresets(widths: PresetWidths): SizePreset[] {
  return [
    { key: "original", labelKey: "original", width: null, height: null },
    { key: "icon", labelKey: "icon", width: null, height: "1.5em" },
    { key: "small", labelKey: "small", width: `${widths.small}px`, height: null },
    { key: "medium", labelKey: "medium", width: `${widths.medium}px`, height: null },
    { key: "large", labelKey: "large", width: `${widths.large}px`, height: null },
  ];
}
