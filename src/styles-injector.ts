const PREFIX = "lie";

export interface PresetWidths {
  small: number;
  medium: number;
  large: number;
}

export const DEFAULT_PRESET_WIDTHS: PresetWidths = { small: 200, medium: 400, large: 800 };

// The built-in, toggleable classes (F15): alignment + inline ONLY. Their CSS lives STATICALLY in
// `styles.css` (the `.lie-left/right/center` `:has()` host rules + `img.lie-inline`, each gated by
// `body:not(.lie-cls-off-NAME)`), and the 3-layer RENDER_CSS likewise. So the plugin injects NO
// `<style>` element at runtime — Obsidian loads `styles.css` for us (Obsidian-review compliance:
// `no-forbidden-elements`). Decoration (rounded / shadow / border / circle) ships as INSTALLABLE
// snippets (F16), not here.
//
// This class no longer builds a stylesheet; it only flips the DYNAMIC state on `<body>`:
//   • the three preset-width CSS vars (`--lie-size-*`), which override the styles.css defaults so a
//     stored `width: var(--lie-size-medium)` resolves to the user's configured px; and
//   • a per-class `lie-cls-off-NAME` marker that the `body:not(.lie-cls-off-NAME)` rules react to,
//     replacing the old "omit the rule from the injected CSS" disable mechanism.
// Both use the sanctioned non-`<style>` CSSOM paths (`style.setProperty` / `classList.toggle`) —
// the same body-class device already used by applyTallFloatClass / applyButtonOutlines.
const DEFAULT_CLASS_NAMES = ["float-left", "float-right", "block-left", "block-center", "block-right", "inline"] as const;

export class StylesInjector {
  private disabledClasses = new Set<string>();
  private presetWidths: PresetWidths = DEFAULT_PRESET_WIDTHS;

  inject(disabled: string[], presetWidths: PresetWidths = DEFAULT_PRESET_WIDTHS): void {
    this.disabledClasses = new Set(disabled);
    this.presetWidths = presetWidths;
    this.update();
  }

  // Clear all the body-level state this injector set (mirrors the onunload cleanup in main.ts).
  remove(): void {
    const { style, classList } = document.body;
    style.removeProperty(`--${PREFIX}-size-small`);
    style.removeProperty(`--${PREFIX}-size-medium`);
    style.removeProperty(`--${PREFIX}-size-large`);
    for (const name of DEFAULT_CLASS_NAMES) classList.remove(`${PREFIX}-cls-off-${name}`);
  }

  update(): void {
    const { style, classList } = document.body;
    // Preset widths override the styles.css defaults; setProperty with a dynamic value is the
    // sanctioned non-`<style>` path (a static literal would be flagged, a CSS var/dynamic value is not).
    style.setProperty(`--${PREFIX}-size-small`, `${this.presetWidths.small}px`);
    style.setProperty(`--${PREFIX}-size-medium`, `${this.presetWidths.medium}px`);
    style.setProperty(`--${PREFIX}-size-large`, `${this.presetWidths.large}px`);
    // Disabled built-in classes → a body marker the `body:not(.lie-cls-off-NAME)` rules react to.
    for (const name of DEFAULT_CLASS_NAMES) {
      classList.toggle(`${PREFIX}-cls-off-${name}`, this.disabledClasses.has(name));
    }
  }

  getClassNames(): string[] {
    return DEFAULT_CLASS_NAMES.map((name) => `${PREFIX}-${name}`);
  }

  getAvailableClasses(): { name: string; prefixed: string; enabled: boolean }[] {
    return DEFAULT_CLASS_NAMES.map((name) => ({
      name,
      prefixed: `${PREFIX}-${name}`,
      enabled: !this.disabledClasses.has(name),
    }));
  }
}
