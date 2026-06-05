import { FilterData, getFilterDefaults, nonDefaultFilter } from "./transforms";
import { t, TranslationKey } from "./i18n";
import { AnchoredSubmenu } from "./anchored-submenu";
import { textButton } from "./ui";

export interface FilterPanelCallbacks {
  // Apply the working filter to the live image WITHOUT persisting (live preview).
  onPreview: (filter: FilterData) => void;
  // Persist the working filter into the document (F14/AD8): fired once when the panel is LEFT to
  // persist — ✓ accept, Enter, click-away, dismiss, context loss.
  onCommit: (filter: FilterData) => void;
  // DISCARD (✗ cancel / Esc): restore the live preview to the pre-open filter — no source write.
  onCancel: () => void;
  // The panel element was removed — clear any reference the owner holds.
  onClose: () => void;
}

interface FilterSlider {
  key: keyof FilterData;
  label: TranslationKey;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

const SLIDERS: FilterSlider[] = [
  { key: "brightness", label: "brightness", min: 0, max: 2, step: 0.05, default: 1 },
  { key: "contrast", label: "contrast", min: 0, max: 2, step: 0.05, default: 1 },
  { key: "saturate", label: "saturation", min: 0, max: 3, step: 0.05, default: 1 },
  { key: "hueRotate", label: "hue", min: 0, max: 360, step: 1, default: 0, unit: "deg" },
  { key: "blur", label: "blur", min: 0, max: 10, step: 0.1, default: 0, unit: "px" },
  { key: "grayscale", label: "grayscale", min: 0, max: 1, step: 0.05, default: 0 },
  { key: "sepia", label: "sepia", min: 0, max: 1, step: 0.05, default: 0 },
];

interface Preset {
  name: string;
  labelKey: TranslationKey;
  values: Partial<FilterData>;
}

const PRESETS: Preset[] = [
  { name: "bw", labelKey: "bw", values: { grayscale: 1, contrast: 1.1 } },
  { name: "sepia", labelKey: "sepia", values: { sepia: 0.8, contrast: 1.05, brightness: 1.05 } },
  { name: "vintage", labelKey: "vintage", values: { sepia: 0.4, contrast: 1.2, brightness: 0.9, saturate: 0.8 } },
  { name: "warm", labelKey: "warm", values: { hueRotate: 15, saturate: 1.3, brightness: 1.05 } },
  { name: "cool", labelKey: "cool", values: { hueRotate: 200, saturate: 0.9, brightness: 1.05 } },
];

export class FilterPanel {
  private submenu: AnchoredSubmenu | null = null;
  private body: HTMLElement | null = null;
  private values: Required<FilterData>;
  private histogramCanvas: HTMLCanvasElement | null = null;
  private img: HTMLImageElement;
  private callbacks: FilterPanelCallbacks;

  constructor(
    img: HTMLImageElement,
    existingFilter: FilterData | undefined,
    callbacks: FilterPanelCallbacks
  ) {
    this.img = img;
    this.callbacks = callbacks;
    this.values = { ...getFilterDefaults(), ...existingFilter };
  }

  // Open via the SHARED anchored sub-menu (D8/D10/T9): same greyed-toolbar / icon
  // confirm-cancel / Esc=cancel behaviour as the size & crop menus — only the
  // placement differs (beside the image, because the panel is large, D8). The panel
  // is a toggle and forms one active region with the image+toolbar (D7).
  open(anchorEl: HTMLElement, toolbarEl?: HTMLElement | null): void {
    if (this.submenu) return;

    const body = document.createElement("div");
    body.classList.add("lie-filter-body");
    body.appendChild(this.buildHistogram());
    body.appendChild(this.buildPresets());
    body.appendChild(this.buildSliders());
    this.body = body;

    const submenu = new AnchoredSubmenu();
    submenu.open({
      body,
      placement: "beside-image",
      anchor: anchorEl,
      toolbar: toolbarEl ?? null,
      title: t("filters"),
      rootClass: "lie-filter-panel",
      allowFlip: false,                  // never flip onto the file explorer (Bug 56)
      hideWhenAnchorOffscreen: true,     // track the image; hide when it scrolls away
      // Show/hide with the toolbar's hover while staying part of the active region
      // (D6/D7): the live-preview overlay is the hover region. In reading view there's
      // no overlay → undefined → the panel stays shown until dismissed.
      hoverRegion: anchorEl.closest<HTMLElement>(".lie-wrapper") ?? undefined,
      // Per-panel reset (the SAME shared-host reset as crop/size, F14/Bug 33):
      // clear all filters to default and preview; the panel stays open.
      onReset: () => this.resetFilters(),
      onCommit: () => this.callbacks.onCommit(this.currentFilter()),
      onCancel: () => this.callbacks.onCancel(),
      onClose: () => { this.submenu = null; this.body = null; this.callbacks.onClose(); },
    });
    this.submenu = submenu;

    this.updateHistogram();
  }

  // Leave the panel to PERSIST (`persist`, the default — accept/leave); `persist=false` is the
  // silent teardown for plugin unload. The ✗/Esc DISCARD path is internal to the AnchoredSubmenu
  // (its cancel icon / Esc) and runs `onCancel`. Idempotent (AnchoredSubmenu guards double-fire).
  close(persist = true): void {
    this.submenu?.close(persist ? "commit" : "silent");
  }

  // The non-default working values, ready to persist (shares the "≠ default" predicate).
  private currentFilter(): FilterData {
    return nonDefaultFilter(this.values);
  }

  private buildHistogram(): HTMLElement {
    const container = document.createElement("div");
    container.classList.add("lie-filter-histogram");
    this.histogramCanvas = document.createElement("canvas");
    this.histogramCanvas.width = 200;
    this.histogramCanvas.height = 60;
    container.appendChild(this.histogramCanvas);
    return container;
  }

  private buildPresets(): HTMLElement {
    const container = document.createElement("div");
    container.classList.add("lie-filter-presets");

    const label = document.createElement("span");
    label.classList.add("lie-filter-section-label");
    label.textContent = t("presets");
    container.appendChild(label);

    const btnRow = document.createElement("div");
    btnRow.classList.add("lie-filter-preset-row");
    for (const preset of PRESETS) {
      btnRow.appendChild(textButton(t(preset.labelKey), "lie-filter-preset-btn", () => this.applyPreset(preset)));
    }
    container.appendChild(btnRow);
    return container;
  }

  // Sliders grouped Light / Color / Effect (D5).
  private buildSliders(): HTMLElement {
    const container = document.createElement("div");
    container.classList.add("lie-filter-sliders");

    const groups: { label: TranslationKey; keys: (keyof FilterData)[] }[] = [
      { label: "groupLight", keys: ["brightness", "contrast"] },
      { label: "groupColor", keys: ["saturate", "hueRotate"] },
      { label: "groupEffect", keys: ["blur", "grayscale", "sepia"] },
    ];

    for (const group of groups) {
      const section = document.createElement("div");
      section.classList.add("lie-filter-group");

      const label = document.createElement("span");
      label.classList.add("lie-filter-section-label");
      label.textContent = t(group.label);
      section.appendChild(label);

      for (const key of group.keys) {
        const slider = SLIDERS.find((s) => s.key === key);
        if (slider) section.appendChild(this.buildSlider(slider));
      }
      container.appendChild(section);
    }

    return container;
  }

  // Reset every filter to its default (no filter) and live-preview; the panel stays
  // open. Wired to the shared sub-menu's per-panel reset (F14).
  private resetFilters(): void {
    this.values = { ...getFilterDefaults() };
    this.refreshSliders();
    this.emitPreview();
    this.updateHistogram();
  }

  private buildSlider(config: FilterSlider): HTMLElement {
    const row = document.createElement("div");
    row.classList.add("lie-filter-slider-row");

    const label = document.createElement("span");
    label.classList.add("lie-filter-slider-label");
    label.textContent = t(config.label);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.value = String(this.values[config.key] ?? config.default);
    input.classList.add("lie-filter-slider-input");
    // Tag by key so refreshSliders() matches by key, not DOM index (robust to reordering).
    input.dataset["key"] = String(config.key);

    const valueDisplay = document.createElement("span");
    valueDisplay.classList.add("lie-filter-slider-value");
    valueDisplay.textContent = this.formatValue(this.values[config.key] ?? config.default, config);

    input.addEventListener("input", () => {
      const val = parseFloat(input.value);
      this.values[config.key] = val;
      valueDisplay.textContent = this.formatValue(val, config);
      this.emitPreview();
      this.updateHistogram();
    });

    input.addEventListener("dblclick", () => {
      this.values[config.key] = config.default;
      input.value = String(config.default);
      valueDisplay.textContent = this.formatValue(config.default, config);
      this.emitPreview();
      this.updateHistogram();
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(valueDisplay);
    return row;
  }

  private formatValue(val: number, config: FilterSlider): string {
    const rounded = Math.round(val * 100) / 100;
    return config.unit ? `${rounded}${config.unit}` : String(rounded);
  }

  private applyPreset(preset: Preset): void {
    const defaults = getFilterDefaults();
    this.values = { ...defaults, ...preset.values };
    this.refreshSliders();
    this.emitPreview();
    this.updateHistogram();
  }

  private refreshSliders(): void {
    if (!this.body) return;
    // Match each input by its data-key (NOT by DOM index) so a slider reorder can't
    // desync the value displays.
    for (const slider of SLIDERS) {
      const input = this.body.querySelector<HTMLInputElement>(
        `.lie-filter-slider-input[data-key="${slider.key}"]`
      );
      const row = input?.closest(".lie-filter-slider-row");
      const display = row?.querySelector<HTMLElement>(".lie-filter-slider-value");
      if (input && display) {
        const val = this.values[slider.key] ?? slider.default;
        input.value = String(val);
        display.textContent = this.formatValue(val, slider);
      }
    }
  }

  // Live preview only — never writes to the document. The image's filter vars are
  // set straight on the DOM, so the change is visible immediately and doesn't wait
  // on (or get lost in) an embed re-render. Persistence happens once, on commit.
  private emitPreview(): void {
    this.callbacks.onPreview(this.currentFilter());
  }

  private updateHistogram(): void {
    if (!this.histogramCanvas) return;
    const ctx = this.histogramCanvas.getContext("2d");
    if (!ctx) return;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    const w = Math.min(this.img.naturalWidth, 200);
    const h = Math.min(this.img.naturalHeight, 200);
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCtx.drawImage(this.img, 0, 0, w, h);

    let imageData: ImageData;
    try {
      imageData = tempCtx.getImageData(0, 0, w, h);
    } catch {
      return;
    }

    const rHist = new Uint32Array(256);
    const gHist = new Uint32Array(256);
    const bHist = new Uint32Array(256);

    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r < 256) rHist[r] = (rHist[r] ?? 0) + 1;
      if (g < 256) gHist[g] = (gHist[g] ?? 0) + 1;
      if (b < 256) bHist[b] = (bHist[b] ?? 0) + 1;
    }

    const maxVal = Math.max(
      ...Array.from(rHist),
      ...Array.from(gHist),
      ...Array.from(bHist)
    );

    const cw = this.histogramCanvas.width;
    const ch = this.histogramCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    this.drawChannel(ctx, rHist, maxVal, cw, ch, "rgba(255,0,0,0.4)");
    this.drawChannel(ctx, gHist, maxVal, cw, ch, "rgba(0,255,0,0.4)");
    this.drawChannel(ctx, bHist, maxVal, cw, ch, "rgba(0,0,255,0.4)");
  }

  private drawChannel(
    ctx: CanvasRenderingContext2D,
    hist: Uint32Array,
    maxVal: number,
    cw: number,
    ch: number,
    color: string
  ): void {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * cw;
      const y = ch - ((hist[i]! / maxVal) * ch);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
