import { setIcon } from "obsidian";
import { PresetWidths } from "./styles-injector";
import { t } from "./i18n";
import { SizeState, sizePresets } from "./size-submenu-logic";
import { textButton } from "./ui";

export type { SizeState };

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
  current: { width?: string; height?: string; inline?: boolean },
  onPreview: (s: SizeState) => void,
  state: SizeState,
  presetWidths: PresetWidths
): SizeBody {
  state.width = current.width ?? null;
  state.height = current.height ?? null;
  state.inline = current.inline ?? false;

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
  for (const p of sizePresets(presetWidths)) {
    quick.appendChild(textButton(t(p.labelKey), "lie-size-choice", () => {
      state.width = p.width;
      state.height = p.height;
      state.inline = p.inline;  // icon → inline rendering (F17); the others clear it
      sync();
      preview();
    }));
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
      state.inline = false;
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
