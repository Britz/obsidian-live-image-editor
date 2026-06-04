import { setIcon } from "obsidian";
import { PresetWidths } from "./styles-injector";
import { t } from "./i18n";

// CSS length strings (or null = unset). Width null + height null == "Original".
export interface SizeState {
  width: string | null;
  height: string | null;
}

// One-tap size preset (F24): each yields a width/height CSS pair. small/medium/large BAKE the
// configured px width (faithful → the bare width=N key, not setting-reactive); icon sets a
// line-height height (the inline icon size); original clears both.
interface SizePreset {
  key: string;
  labelKey: Parameters<typeof t>[0];
  width: string | null;
  height: string | null;
}

function presets(widths: PresetWidths): SizePreset[] {
  return [
    { key: "original", labelKey: "original", width: null, height: null },
    { key: "icon", labelKey: "icon", width: null, height: "1.5em" },
    { key: "small", labelKey: "small", width: `${widths.small}px`, height: null },
    { key: "medium", labelKey: "medium", width: `${widths.medium}px`, height: null },
    { key: "large", labelKey: "large", width: `${widths.large}px`, height: null },
  ];
}

export interface SizeBody {
  body: HTMLElement;
  reset: () => void;
}

/**
 * Build the body of the size sub-menu (D6.1): the one-tap presets (F24) plus custom
 * width AND height fields side by side. Compact — it hangs under the toolbar via the
 * shared AnchoredSubmenu. `onPreview` fires as the user picks/types; the AnchoredSubmenu
 * commits the last preview (or reverts on cancel). `state` is the shared holder the
 * owner reads on commit.
 */
export function buildSizeBody(
  current: { width?: string; height?: string },
  onPreview: (s: SizeState) => void,
  state: SizeState,
  presetWidths: PresetWidths
): SizeBody {
  state.width = current.width ?? null;
  state.height = current.height ?? null;

  const body = document.createElement("div");
  body.classList.add("lie-size-body");

  const widthInput = document.createElement("input");
  const heightInput = document.createElement("input");

  const sync = (): void => {
    widthInput.value = pxNumber(state.width);
    heightInput.value = pxNumber(state.height);
  };
  const preview = (): void => onPreview(state);

  const quick = document.createElement("div");
  quick.classList.add("lie-size-quick");
  for (const p of presets(presetWidths)) {
    const btn = document.createElement("button");
    btn.classList.add("lie-size-choice");
    btn.textContent = t(p.labelKey);
    btn.addEventListener("click", () => {
      state.width = p.width;
      state.height = p.height;
      sync();
      preview();
    });
    quick.appendChild(btn);
  }
  body.appendChild(quick);

  const fields = document.createElement("div");
  fields.classList.add("lie-size-fields");
  fields.appendChild(makeField("move-horizontal", t("width"), widthInput, (v) => {
    state.width = v;
    preview();
  }));
  fields.appendChild(makeField("move-vertical", t("height"), heightInput, (v) => {
    state.height = v;
    preview();
  }));
  body.appendChild(fields);

  sync();
  window.setTimeout(() => widthInput.focus(), 0);

  return {
    body,
    reset: () => {
      state.width = null;
      state.height = null;
      sync();
      preview();
    },
  };
}

// Show only a literal px value in a number field (a preset var / em leaves it blank).
function pxNumber(v: string | null): string {
  const m = v?.match(/^(\d+(?:\.\d+)?)px$/);
  return m ? (m[1] ?? "") : "";
}

function makeField(icon: string, placeholder: string, input: HTMLInputElement, onInput: (v: string | null) => void): HTMLElement {
  const row = document.createElement("div");
  row.classList.add("lie-size-custom");

  const iconEl = document.createElement("span");
  iconEl.classList.add("lie-size-icon");
  setIcon(iconEl, icon);
  row.appendChild(iconEl);

  input.type = "number";
  input.min = "20";
  input.placeholder = placeholder;
  input.classList.add("lie-size-input");
  input.addEventListener("input", () => {
    const n = parseInt(input.value, 10);
    onInput(n > 0 ? `${n}px` : null);
  });
  row.appendChild(input);
  return row;
}
