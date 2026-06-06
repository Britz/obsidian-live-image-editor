import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "./i18n";

// The image extensions the picker offers as replacement targets (Feature 3). Obsidian's own embed
// detection covers the same raster/vector set; svg/avif/bmp are included for parity with the toolbar.
export const REPLACE_IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp",
]);

export function isReplaceableImage(file: TFile): boolean {
  return REPLACE_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

// A fuzzy vault image picker: lists every image file in the vault, returns the chosen TFile. Used by
// both "Replace image" and "Replace all". Cancelling (Esc) resolves to null.
export class ImagePickerModal extends FuzzySuggestModal<TFile> {
  private resolved = false;

  constructor(app: App, private readonly onPick: (file: TFile | null) => void) {
    super(app);
    this.setPlaceholder(t("replacePickerPlaceholder"));
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(isReplaceableImage);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.resolved = true;
    this.onPick(file);
  }

  onClose(): void {
    super.onClose();
    // Esc / click-away without a pick → report a cancel exactly once.
    if (!this.resolved) this.onPick(null);
  }
}
