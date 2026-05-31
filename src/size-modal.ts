import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";

export class SizeModal extends Modal {
  private width = "";
  private height = "";
  private keepRatio = true;
  private onSubmit: (width: number, height?: number) => void;

  constructor(app: App, currentWidth: number | undefined, currentHeight: number | undefined, onSubmit: (width: number, height?: number) => void) {
    super(app);
    this.width = currentWidth?.toString() ?? "";
    this.height = currentHeight?.toString() ?? "";
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.classList.add("lie-size-modal");

    contentEl.createEl("h3", { text: t("customSize") });

    new Setting(contentEl)
      .setName(t("width"))
      .addText((text) => {
        text.setPlaceholder("px")
          .setValue(this.width)
          .onChange((v) => { this.width = v; });
        text.inputEl.type = "number";
        text.inputEl.focus();
      });

    new Setting(contentEl)
      .setName(t("height"))
      .addText((text) => {
        text.setPlaceholder("px")
          .setValue(this.height)
          .onChange((v) => { this.height = v; });
        text.inputEl.type = "number";
      });

    new Setting(contentEl)
      .setName(t("keepAspectRatio"))
      .addToggle((toggle) => {
        toggle.setValue(this.keepRatio)
          .onChange((v) => { this.keepRatio = v; });
      });

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText(t("apply"))
          .setCta()
          .onClick(() => this.submit());
      })
      .addButton((btn) => {
        btn.setButtonText(t("cancel"))
          .onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private submit(): void {
    const w = parseInt(this.width, 10);
    if (!w || w <= 0) return;

    const h = this.height ? parseInt(this.height, 10) : undefined;
    this.onSubmit(w, h && h > 0 ? h : undefined);
    this.close();
  }
}
