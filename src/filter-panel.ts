import { FilterData, getFilterDefaults } from "./transforms";
import { t, TranslationKey } from "./i18n";

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
  private el: HTMLElement | null = null;
  private values: Required<FilterData>;
  private histogramCanvas: HTMLCanvasElement | null = null;
  private img: HTMLImageElement;
  private onChange: (filter: FilterData) => void;
  private onClose: () => void;

  constructor(
    img: HTMLImageElement,
    existingFilter: FilterData | undefined,
    onChange: (filter: FilterData) => void,
    onClose: () => void
  ) {
    this.img = img;
    this.onChange = onChange;
    this.onClose = onClose;
    this.values = { ...getFilterDefaults(), ...existingFilter };
  }

  open(anchorEl: HTMLElement): void {
    this.close();

    const panel = document.createElement("div");
    panel.classList.add("lie-filter-panel");

    panel.appendChild(this.buildHistogram());
    panel.appendChild(this.buildPresets());
    panel.appendChild(this.buildSliders());

    const rect = anchorEl.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = `${rect.top}px`;
    panel.style.left = `${rect.right + 8}px`;

    document.body.appendChild(panel);
    this.el = panel;

    this.updateHistogram();

    document.addEventListener("mousedown", this.handleClickOutside);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  close(): void {
    document.removeEventListener("mousedown", this.handleClickOutside);
    document.removeEventListener("keydown", this.handleKeyDown);
    this.el?.remove();
    this.el = null;
    this.onClose();
  }

  private handleClickOutside = (e: MouseEvent): void => {
    if (this.el && !this.el.contains(e.target as Node)) {
      this.close();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.close();
  };

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
      const btn = document.createElement("button");
      btn.classList.add("lie-filter-preset-btn");
      btn.textContent = t(preset.labelKey);
      btn.addEventListener("click", () => this.applyPreset(preset));
      btnRow.appendChild(btn);
    }
    container.appendChild(btnRow);
    return container;
  }

  private buildSliders(): HTMLElement {
    const container = document.createElement("div");
    container.classList.add("lie-filter-sliders");

    for (const slider of SLIDERS) {
      container.appendChild(this.buildSlider(slider));
    }

    return container;
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

    const valueDisplay = document.createElement("span");
    valueDisplay.classList.add("lie-filter-slider-value");
    valueDisplay.textContent = this.formatValue(this.values[config.key] ?? config.default, config);

    input.addEventListener("input", () => {
      const val = parseFloat(input.value);
      this.values[config.key] = val;
      valueDisplay.textContent = this.formatValue(val, config);
      this.emitChange();
      this.updateHistogram();
    });

    input.addEventListener("dblclick", () => {
      this.values[config.key] = config.default;
      input.value = String(config.default);
      valueDisplay.textContent = this.formatValue(config.default, config);
      this.emitChange();
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
    this.emitChange();
    this.updateHistogram();
  }

  private refreshSliders(): void {
    if (!this.el) return;
    const inputs = this.el.querySelectorAll(".lie-filter-slider-input");
    const valueDisplays = this.el.querySelectorAll(".lie-filter-slider-value");

    let i = 0;
    for (const slider of SLIDERS) {
      const input = inputs[i] as HTMLInputElement | undefined;
      const display = valueDisplays[i] as HTMLElement | undefined;
      if (input && display) {
        const val = this.values[slider.key] ?? slider.default;
        input.value = String(val);
        display.textContent = this.formatValue(val, slider);
      }
      i++;
    }
  }

  private emitChange(): void {
    const defaults = getFilterDefaults();
    const filtered: FilterData = {};
    for (const slider of SLIDERS) {
      const val = this.values[slider.key];
      if (val !== defaults[slider.key]) {
        filtered[slider.key] = val;
      }
    }
    this.onChange(filtered);
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
