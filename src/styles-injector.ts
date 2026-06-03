const PREFIX = "lie";

export interface PresetWidths {
  small: number;
  medium: number;
  large: number;
}

export const DEFAULT_PRESET_WIDTHS: PresetWidths = { small: 200, medium: 400, large: 800 };

interface InternalClass {
  name: string;
  css: string;
}

// Built-in, toggleable classes (F15): alignment + inline ONLY. Decoration (rounded /
// shadow / border / circle) ships as INSTALLABLE snippets (F16), not injected here.
// Alignment must act on the flow participant — the LP overlay `.lie-wrapper` or the
// reading-view `.image-embed` — via `:has()`, never the img or the box (Bug 11/20).
const ALIGN_HOSTS = ".lie-wrapper:has(img.lie-PREFIX), .image-embed:has(img.lie-PREFIX)";
const host = (cls: string): string => ALIGN_HOSTS.replace(/PREFIX/g, cls);

const DEFAULT_CLASSES: InternalClass[] = [
  {
    name: "left",
    css: `${host("left")} { float: left; clear: none; margin: 0 1em 0.5em 0; }`,
  },
  {
    name: "right",
    css: `${host("right")} { float: right; clear: none; margin: 0 0 0.5em 1em; }`,
  },
  {
    // Centre via text-align on a FULL-WIDTH block host (centres the inline-block box
    // inside) — not margin:auto, which Obsidian's `.cm-content > * { margin:0
    // !important }` beats (Bug 20).
    name: "center",
    css: `${host("center")} { float: none; display: block; width: 100%; text-align: center; }`,
  },
  {
    name: "inline",
    css: `img.${PREFIX}-inline { display: inline; vertical-align: middle; }`,
  },
];

export class StylesInjector {
  private styleEl: HTMLStyleElement | null = null;
  private disabledClasses = new Set<string>();
  private presetWidths: PresetWidths = DEFAULT_PRESET_WIDTHS;

  inject(disabled: string[], presetWidths: PresetWidths = DEFAULT_PRESET_WIDTHS): void {
    this.disabledClasses = new Set(disabled);
    this.presetWidths = presetWidths;
    this.update();
  }

  remove(): void {
    this.styleEl?.remove();
    this.styleEl = null;
  }

  update(): void {
    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = "lie-internal-styles";
      document.head.appendChild(this.styleEl);
    }

    const presetVars = `body {
  --${PREFIX}-size-small: ${this.presetWidths.small}px;
  --${PREFIX}-size-medium: ${this.presetWidths.medium}px;
  --${PREFIX}-size-large: ${this.presetWidths.large}px;
}`;

    const classCss = DEFAULT_CLASSES
      .filter((c) => !this.disabledClasses.has(c.name))
      .map((c) => c.css)
      .join("\n");

    this.styleEl.textContent = `${presetVars}\n${classCss}`;
  }

  getClassNames(): string[] {
    return DEFAULT_CLASSES.map((c) => `${PREFIX}-${c.name}`);
  }

  getAvailableClasses(): { name: string; prefixed: string; enabled: boolean }[] {
    return DEFAULT_CLASSES.map((c) => ({
      name: c.name,
      prefixed: `${PREFIX}-${c.name}`,
      enabled: !this.disabledClasses.has(c.name),
    }));
  }
}
