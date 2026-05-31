import { Plugin } from "obsidian";
import { t } from "./i18n";

export interface CommandHandler {
  getActiveImage(): HTMLImageElement | null;
  rotateCw(): void;
  rotateCcw(): void;
  flipH(): void;
  flipV(): void;
  crop(): void;
  openFilters(): void;
  sizeSmall(): void;
  sizeMedium(): void;
  sizeLarge(): void;
  classLeft(): void;
  classRight(): void;
  classCenter(): void;
  addClass(): void;
  reset(): void;
  customSize(): void;
  toggleInline(): void;
  exportImage(): void;
}

export function registerCommands(plugin: Plugin, handler: CommandHandler): void {
  const commands: { id: string; name: string; action: () => void }[] = [
    { id: "rotate-cw", name: t("rotateCw"), action: () => handler.rotateCw() },
    { id: "rotate-ccw", name: t("rotateCcw"), action: () => handler.rotateCcw() },
    { id: "flip-h", name: t("flipH"), action: () => handler.flipH() },
    { id: "flip-v", name: t("flipV"), action: () => handler.flipV() },
    { id: "crop", name: t("crop"), action: () => handler.crop() },
    { id: "filters", name: t("filters"), action: () => handler.openFilters() },
    { id: "size-small", name: "Size: Small", action: () => handler.sizeSmall() },
    { id: "size-medium", name: "Size: Medium", action: () => handler.sizeMedium() },
    { id: "size-large", name: "Size: Large", action: () => handler.sizeLarge() },
    { id: "class-left", name: "Align: Left", action: () => handler.classLeft() },
    { id: "class-right", name: "Align: Right", action: () => handler.classRight() },
    { id: "class-center", name: "Align: Center", action: () => handler.classCenter() },
    { id: "add-class", name: t("snippets"), action: () => handler.addClass() },
    { id: "reset", name: t("reset"), action: () => handler.reset() },
    { id: "custom-size", name: t("customSize"), action: () => handler.customSize() },
    { id: "toggle-inline", name: t("inlineBlock"), action: () => handler.toggleInline() },
    { id: "export", name: t("export"), action: () => handler.exportImage() },
  ];

  for (const cmd of commands) {
    plugin.addCommand({
      id: cmd.id,
      name: cmd.name,
      checkCallback: (checking: boolean) => {
        if (handler.getActiveImage()) {
          if (!checking) cmd.action();
          return true;
        }
        return false;
      },
    });
  }
}
