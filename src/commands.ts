import { Plugin } from "obsidian";
import { t } from "./i18n";

export interface CommandHandler {
  // Is there any target for an image-specific command right now? — the single hover/cursor image OR
  // a multi-image editor selection. null context ⇒ false ⇒ Obsidian hides the command from the
  // palette. The action itself re-resolves the scope (single vs multi) fresh at run time.
  canRun(): boolean;
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
  // Page-scope (NOT image-specific): acts on every image in the active note.
  resetAllImages(): void;
}

interface CommandDef {
  id: string;
  name: string;
  action: () => void;
  // Image-specific commands (the default) self-gate on image context via `checkCallback` (F19):
  // they appear in the palette only when an image is hover-active OR on the cursor line. Page-
  // scope commands (`imageSpecific: false`) act on the whole note and register as a plain,
  // always-visible `callback` — the home for the still-backlogged flatten/export-page commands.
  imageSpecific?: boolean;
}

export function registerCommands(plugin: Plugin, handler: CommandHandler): void {
  const commands: CommandDef[] = [
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
    { id: "reset-all-images", name: t("cmdResetAllImages"), action: () => handler.resetAllImages(), imageSpecific: false },
  ];

  for (const cmd of commands) {
    if (cmd.imageSpecific === false) {
      // Page-scope: always listed in the palette; the action itself notifies when there is
      // nothing to do (no editor / no edited images).
      plugin.addCommand({ id: cmd.id, name: cmd.name, callback: cmd.action });
      continue;
    }
    // Image-specific: self-gate on image context (single hover/cursor image OR a multi-image
    // selection). `checkCallback` is the SAME path Obsidian uses for the palette listing
    // (checking=true → just gate via `canRun`) and execution (checking=false → run; the action
    // re-resolves single-vs-multi scope fresh, since the palette modal clears the hover state).
    plugin.addCommand({
      id: cmd.id,
      name: cmd.name,
      checkCallback: (checking: boolean) => {
        if (!handler.canRun()) return false;
        if (!checking) cmd.action();
        return true;
      },
    });
  }
}
