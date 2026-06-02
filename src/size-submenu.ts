import { setIcon } from "obsidian";
import { t } from "./i18n";

// `null` == unset. Width null + height null == "Original".
export interface SizeState {
  width: number | null;
  height: number | null;
}

export interface SizePresets {
  small: number;
  medium: number;
  large: number;
}

/**
 * Build the body of the custom-size sub-menu (D8): quick choices Original / Small
 * / Medium / Large plus custom width AND height entries (Bug 10). Compact — it
 * hangs under the toolbar via the shared AnchoredSubmenu. `onPreview` fires as the
 * user types/picks so the change is visible immediately; the AnchoredSubmenu
 * commits the last preview or reverts on cancel. `state` is the shared holder the
 * owner reads on commit.
 */
export interface SizeBody {
  body: HTMLElement;
  // Reset ONLY the size (width+height) to unset and preview — wired to the shared
  // sub-menu's per-panel reset.
  reset: () => void;
}

export function buildSizeBody(
  current: { width?: number; height?: number },
  presets: SizePresets,
  onPreview: (s: SizeState) => void,
  state: SizeState
): SizeBody {
  state.width = current.width ?? null;
  state.height = current.height ?? null;

  const body = document.createElement("div");
  body.classList.add("lie-size-body");

  const widthInput = document.createElement("input");
  const heightInput = document.createElement("input");

  const sync = (): void => {
    widthInput.value = state.width === null ? "" : String(state.width);
    heightInput.value = state.height === null ? "" : String(state.height);
  };
  const preview = (): void => onPreview(state);

  // Quick choices set a width and clear the height (keep aspect ratio).
  const quick = document.createElement("div");
  quick.classList.add("lie-size-quick");
  const choices: { label: string; w: number | null }[] = [
    { label: t("original"), w: null },
    { label: t("small"), w: presets.small },
    { label: t("medium"), w: presets.medium },
    { label: t("large"), w: presets.large },
  ];
  for (const c of choices) {
    const btn = document.createElement("button");
    btn.classList.add("lie-size-choice");
    btn.textContent = c.label;
    btn.addEventListener("click", () => {
      state.width = c.w;
      state.height = null;
      sync();
      preview();
    });
    quick.appendChild(btn);
  }
  body.appendChild(quick);

  // Width and height side by side (one row).
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

function makeField(icon: string, placeholder: string, input: HTMLInputElement, onInput: (v: number | null) => void): HTMLElement {
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
    onInput(n > 0 ? n : null);
  });
  row.appendChild(input);
  return row;
}
