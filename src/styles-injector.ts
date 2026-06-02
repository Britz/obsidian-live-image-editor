const PREFIX = "lie";

interface InternalClass {
  name: string;
  css: string;
  enabled: boolean;
}

const DEFAULT_CLASSES: Omit<InternalClass, "enabled">[] = [
  { name: "small", css: `img.${PREFIX}-small { max-width: 200px; height: auto; }` },
  { name: "medium", css: `img.${PREFIX}-medium { max-width: 400px; height: auto; }` },
  { name: "large", css: `img.${PREFIX}-large { max-width: 800px; height: auto; }` },
  // Alignment must act on the block that participates in document flow. For a
  // plain reading-view image that's the img itself; inside our live-preview widget
  // (and reading-view embeds) the img sits in a flex container, so float/auto-margin
  // on the img is ignored — we target the embed container via :has() (Bug 11).
  { name: "left", css: `img.${PREFIX}-left { float: left; margin: 0 1em 0.5em 0; }
.lie-lp-embed:has(.${PREFIX}-left), .image-embed:has(img.${PREFIX}-left) { float: left !important; clear: none; display: inline-block !important; width: max-content; margin: 0 1em 0.5em 0; }` },
  { name: "right", css: `img.${PREFIX}-right { float: right; margin: 0 0 0.5em 1em; }
.lie-lp-embed:has(.${PREFIX}-right), .image-embed:has(img.${PREFIX}-right) { float: right !important; clear: none; display: inline-block !important; width: max-content; margin: 0 0 0.5em 1em; }` },
  { name: "center", css: `img.${PREFIX}-center { display: block; margin-left: auto; margin-right: auto; }
.lie-lp-embed:has(.${PREFIX}-center), .image-embed:has(img.${PREFIX}-center) { float: none !important; display: block !important; width: max-content; margin-left: auto; margin-right: auto; }` },
  { name: "inline", css: `img.${PREFIX}-inline { display: inline; vertical-align: middle; }` },
  { name: "rounded", css: `img.${PREFIX}-rounded { border-radius: 8px; }` },
  { name: "shadow", css: `img.${PREFIX}-shadow { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }` },
  { name: "border", css: `img.${PREFIX}-border { border: 1px solid var(--background-modifier-border); }` },
  { name: "circle", css: `img.${PREFIX}-circle { border-radius: 50%; object-fit: cover; }` },
];

export class StylesInjector {
  private styleEl: HTMLStyleElement | null = null;
  private disabledClasses: Set<string> = new Set();

  inject(disabled: string[]): void {
    this.disabledClasses = new Set(disabled);
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

    const css = DEFAULT_CLASSES
      .filter((c) => !this.disabledClasses.has(c.name))
      .map((c) => c.css)
      .join("\n");

    this.styleEl.textContent = css;
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
