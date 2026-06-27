// Small shared DOM helpers. `textButton` is the labelled-button build the filter / size / crop
// sub-menus all repeated (R0): a <button> with one class, a text label and a click handler.
export function textButton(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const btn = activeDocument.createElement("button");
  btn.classList.add(cls);
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}
