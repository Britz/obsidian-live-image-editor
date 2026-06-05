import { Plugin } from "obsidian";
import { t } from "./i18n";

export interface CommandHandler {
  getActiveImage(): HTMLImageElement | null;
  rotateCw(): void;
  rotateCcw(): void;
  flipH(): void;
  flipV(): void;
  crop(): void;
  toggleFilters(): void;
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
    { id: "filters", name: t("filters"), action: () => handler.toggleFilters() },
    { id: "size-small", name: t("cmdSizeSmall"), action: () => handler.sizeSmall() },
    { id: "size-medium", name: t("cmdSizeMedium"), action: () => handler.sizeMedium() },
    { id: "size-large", name: t("cmdSizeLarge"), action: () => handler.sizeLarge() },
    { id: "class-left", name: t("cmdAlignLeft"), action: () => handler.classLeft() },
    { id: "class-right", name: t("cmdAlignRight"), action: () => handler.classRight() },
    { id: "class-center", name: t("cmdAlignCenter"), action: () => handler.classCenter() },
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
