import { PresetWidths } from "./styles-injector";
import { TranslationKey } from "./i18n";

// The working size state the size sub-menu holds and the owner reads on commit.
// width/height: CSS length strings or null (unset). inline: the F17 inline-icon rendering.
// width null + height null + inline false == "Original".
export interface SizeState {
  width: string | null;
  height: string | null;
  inline: boolean;
}

// One-tap size preset (F24). small/medium/large BAKE the configured px width (faithful → the
// bare width=N key, not setting-reactive); ICON couples to the INLINE rendering (F17) at a
// line-height size; original clears everything back to the natural width.
export interface SizePreset {
  key: string;
  labelKey: TranslationKey;
  width: string | null;
  height: string | null;
  inline: boolean;
}

export function sizePresets(widths: PresetWidths): SizePreset[] {
  return [
    { key: "original", labelKey: "original", width: null, height: null, inline: false },
    { key: "icon", labelKey: "icon", width: null, height: "1.5em", inline: true },
    { key: "small", labelKey: "small", width: `${widths.small}px`, height: null, inline: false },
    { key: "medium", labelKey: "medium", width: `${widths.medium}px`, height: null, inline: false },
    { key: "large", labelKey: "large", width: `${widths.large}px`, height: null, inline: false },
  ];
}
