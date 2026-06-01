import { setIcon } from "obsidian";
import { t } from "./i18n";

// `null` width == "Original" (clears the explicit size).
export type SizeValue = number | null;

export interface SizePresets {
  small: number;
  medium: number;
  large: number;
}

/**
 * Build the body of the custom-size sub-menu (D8): quick choices Original / Small
 * / Medium / Large plus a custom width entry. Compact — it hangs under the toolbar
 * via the shared AnchoredSubmenu. `onPreview` is called as the user picks so the
 * change is visible immediately; the AnchoredSubmenu commits the last preview or
 * reverts on cancel.
 */
export function buildSizeBody(
  current: number | undefined,
  presets: SizePresets,
  onPreview: (value: SizeValue) => void,
  getValue: { value: SizeValue }
): HTMLElement {
  const body = document.createElement("div");
  body.classList.add("lie-size-body");

  const set = (value: SizeValue): void => {
    getValue.value = value;
    onPreview(value);
  };

  const quick = document.createElement("div");
  quick.classList.add("lie-size-quick");
  const choices: { label: string; value: SizeValue }[] = [
    { label: t("original"), value: null },
    { label: t("small"), value: presets.small },
    { label: t("medium"), value: presets.medium },
    { label: t("large"), value: presets.large },
  ];
  for (const c of choices) {
    const btn = document.createElement("button");
    btn.classList.add("lie-size-choice");
    btn.textContent = c.label;
    btn.addEventListener("click", () => {
      input.value = c.value === null ? "" : String(c.value);
      set(c.value);
    });
    quick.appendChild(btn);
  }
  body.appendChild(quick);

  const row = document.createElement("div");
  row.classList.add("lie-size-custom");

  const icon = document.createElement("span");
  icon.classList.add("lie-size-icon");
  setIcon(icon, "move-horizontal");
  row.appendChild(icon);

  const input = document.createElement("input");
  input.type = "number";
  input.min = "20";
  input.placeholder = t("width");
  input.value = current ? String(current) : "";
  input.classList.add("lie-size-input");
  input.addEventListener("input", () => {
    const w = parseInt(input.value, 10);
    set(w > 0 ? w : null);
  });
  // Enter commits via the submenu's confirm — but make Enter behave naturally too.
  row.appendChild(input);

  body.appendChild(row);

  // Reflect the starting value into the shared holder.
  getValue.value = current ?? null;

  // Autofocus the width entry.
  window.setTimeout(() => input.focus(), 0);
  return body;
}
