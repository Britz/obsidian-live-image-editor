import { App } from "obsidian";

// Optional integration with the community "editing-toolbar" plugin (T7/F12). It is
// OFF by default, version-gated (only versions we've validated; others warn), and
// merely surfaces our existing image commands — which already carry the
// image-context condition via their checkCallback, so a button does nothing unless
// an image is in context. Everything here is feature-detected and defensive: if the
// other plugin's shape differs, we no-op rather than throw.

const PLUGIN_ID = "live-image-editor";
const EDITING_TOOLBAR_ID = "editing-toolbar";

// Versions of editing-toolbar this integration has been validated against.
const TESTED_VERSIONS = ["3.0.0", "3.0.1", "3.1.0", "3.1.1"];

// The image commands worth surfacing in the external toolbar.
const COMMAND_IDS = [
  "rotate-cw", "rotate-ccw", "flip-h", "flip-v", "crop",
  "filters", "custom-size", "reset", "export",
];

interface MenuCommand {
  id: string;
  name?: string;
  icon?: string;
}

interface EditingToolbarLike {
  manifest?: { version?: string };
  settings?: { menuCommands?: MenuCommand[] };
  saveSettings?: () => Promise<void> | void;
}

export interface EditingToolbarStatus {
  installed: boolean;
  version: string | null;
  tested: boolean;
}

function getPlugin(app: App): EditingToolbarLike | null {
  try {
    const plugins = (app as unknown as {
      plugins?: { getPlugin?: (id: string) => unknown };
    }).plugins;
    return (plugins?.getPlugin?.(EDITING_TOOLBAR_ID) as EditingToolbarLike | undefined) ?? null;
  } catch {
    return null;
  }
}

export function getEditingToolbarStatus(app: App): EditingToolbarStatus {
  const plugin = getPlugin(app);
  const version = plugin?.manifest?.version ?? null;
  return {
    installed: !!plugin,
    version,
    tested: !!version && TESTED_VERSIONS.includes(version),
  };
}

/** Add our image commands to the editing-toolbar config. Returns false on any failure. */
export async function addEditingToolbarButtons(app: App): Promise<boolean> {
  const plugin = getPlugin(app);
  if (!plugin?.settings) return false;
  try {
    const list: MenuCommand[] = plugin.settings.menuCommands ?? (plugin.settings.menuCommands = []);
    for (const id of COMMAND_IDS) {
      const full = `${PLUGIN_ID}:${id}`;
      if (!list.some((c) => c?.id === full)) {
        list.push({ id: full, name: id, icon: "image" });
      }
    }
    await plugin.saveSettings?.();
    return true;
  } catch {
    return false;
  }
}

/** Remove the commands we added. Returns false on any failure. */
export async function removeEditingToolbarButtons(app: App): Promise<boolean> {
  const plugin = getPlugin(app);
  if (!plugin?.settings?.menuCommands) return false;
  try {
    plugin.settings.menuCommands = plugin.settings.menuCommands.filter(
      (c) => !String(c?.id ?? "").startsWith(`${PLUGIN_ID}:`)
    );
    await plugin.saveSettings?.();
    return true;
  } catch {
    return false;
  }
}
