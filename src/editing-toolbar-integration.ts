import { App } from "obsidian";
import { t } from "./i18n";
import { BRAND_ICON_ID } from "./brand-icon";

// Optional integration with the community "editing-toolbar" plugin (T7/F12). It is
// OFF by default, version-gated (only versions we've validated; others warn). It adds the full image
// toolbar as ONE editing-toolbar SUBMENU ("Image editing"), rendered
// as a horizontal row of icon buttons (editing-toolbar's `menuType: "submenu"`, NOT a dropdown —
// verified live on v4.0.8: "submenu" renders each child as an inline `.menu-item` ButtonComponent,
// "dropdown" pops a vertical menu). We INJECT the entry near the LEFT edge (right after a leading
// undo/redo run if the bar starts with those, else at the very front) so it stays inside the top
// bar's visible width instead of overflowing off the end; editing-toolbar renders it via
// `findCommand` — which resolves our context-gated commands fine. NOTE: editing-toolbar's *manual*
// command picker uses `app.commands.listCommands()`, which hides commands whose checkCallback is
// currently false, so a user CANNOT hand-add our image commands there (only the always-available
// `reset-all-images` shows up); the programmatic injection here is the only way they appear.
// Everything is feature-detected and defensive: if the other plugin's shape differs, we no-op.

const PLUGIN_ID = "live-image-editor";
export const EDITING_TOOLBAR_ID = "editing-toolbar";

// Versions of editing-toolbar this integration has been validated against (the v4 submenu schema —
// `{ id: "SubmenuCommands-…", menuType: "submenu", SubmenuCommands: [...] }` — was inspected live).
const TESTED_VERSIONS = ["3.0.0", "3.0.1", "3.1.0", "3.1.1", "4.0.8"];

// The full image toolbar, as the submenu's child commands (id → icon + localized name), mirroring the
// in-image toolbar order. The row is wide, but since we slot it at the LEFT edge (see below) it always
// renders in full; on a very full bar it's the user's own far-right commands that shift into editing-
// toolbar's overflow — their call. Each id resolves to a `live-image-editor:<id>` registered command.
const SUBMENU_ID = `SubmenuCommands-${PLUGIN_ID}`;
// Fixed brand label (intentionally NOT localized) so our submenu is unmistakably "ours" in editing-
// toolbar's bar and its menu-structure editor — same spirit as our prefixed CSS classes.
const SUBMENU_NAME = "Live Editing Toolbar";
// Icon for the submenu's own button in editing-toolbar's bar/editor.
const SUBMENU_ICON = BRAND_ICON_ID;
// editing-toolbar reads this off the menu entry; "submenu" => inline horizontal icon buttons.
const SUBMENU_TYPE = "submenu";
const SUBMENU_COMMANDS: { id: string; icon: string; nameKey: Parameters<typeof t>[0] }[] = [
  { id: "rotate-cw", icon: "rotate-cw", nameKey: "rotateCw" },
  { id: "rotate-ccw", icon: "rotate-ccw", nameKey: "rotateCcw" },
  { id: "flip-h", icon: "flip-horizontal", nameKey: "flipH" },
  { id: "flip-v", icon: "flip-vertical", nameKey: "flipV" },
  { id: "crop", icon: "crop", nameKey: "crop" },
  { id: "filters", icon: "blend", nameKey: "filters" },
  { id: "custom-size", icon: "image-upscale", nameKey: "customSize" },
  { id: "class-left", icon: "align-left", nameKey: "alignLeft" },
  { id: "class-center", icon: "align-center", nameKey: "alignCenter" },
  { id: "class-right", icon: "align-right", nameKey: "alignRight" },
  { id: "toggle-inline", icon: "wrap-text", nameKey: "inlineBlock" },
  { id: "add-class", icon: "braces", nameKey: "snippets" },
  { id: "export", icon: "image-down", nameKey: "export" },
  { id: "replace-image", icon: "replace", nameKey: "replaceImage" },
  { id: "replace-all-images", icon: "replace-all", nameKey: "replaceAll" },
  // `undo` (not `undo-2`): this is the whole-image reset, kept visually distinct from the panel's
  // "reset this" button (which uses undo-2). Its label is "Reset image" — i.e. all edits on THIS
  // image, not the page-scope "reset all images".
  { id: "reset", icon: "eraser", nameKey: "reset" },
];

interface MenuCommand {
  id: string;
  name?: string;
  icon?: string;
  menuType?: string;
  SubmenuCommands?: MenuCommand[];
}

interface EditingToolbarLike {
  manifest?: { version?: string };
  settings?: { menuCommands?: MenuCommand[] };
  saveSettings?: () => Promise<void> | void;
  clearToolbarCache?: () => void;
}

export interface EditingToolbarStatus {
  installed: boolean; // present in the vault (manifest exists) — enabled or not
  enabled: boolean;   // enabled & loaded in Obsidian
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
  // `manifests` lists every INSTALLED plugin (enabled or not); `enabledPlugins` is the enabled set;
  // `getPlugin` returns the live instance only when enabled. Together they separate the three states.
  const plugins = (app as unknown as {
    plugins?: {
      manifests?: Record<string, { version?: string } | undefined>;
      enabledPlugins?: Set<string>;
    };
  }).plugins;
  const manifest = plugins?.manifests?.[EDITING_TOOLBAR_ID];
  const enabled = !!plugins?.enabledPlugins?.has(EDITING_TOOLBAR_ID);
  const version = getPlugin(app)?.manifest?.version ?? manifest?.version ?? null;
  return {
    installed: !!manifest,
    enabled,
    version,
    tested: !!version && TESTED_VERSIONS.includes(version),
  };
}

// Drop any prior trace of ours — the new submenu and any legacy top-level buttons (older versions
// pushed individual `live-image-editor:<id>` entries) — so add/remove is idempotent.
function stripOurEntries(list: MenuCommand[]): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const id = String(list[i]?.id ?? "");
    if (id === SUBMENU_ID || id.startsWith(`${PLUGIN_ID}:`)) list.splice(i, 1);
  }
}

// Slot our submenu right AFTER a leading undo/redo run (the natural left edge of most bars), else at
// the very front. We don't bury it deeper: appending overflows off a full bar (verified), and the
// user can drag it wherever they like in editing-toolbar's settings — anything cleverer would just
// fight their manual layout.
const LEADING_SKIP = new Set([`${EDITING_TOOLBAR_ID}:editor-undo`, `${EDITING_TOOLBAR_ID}:editor-redo`]);
function insertIndexFor(list: MenuCommand[]): number {
  let at = 0;
  while (at < list.length && LEADING_SKIP.has(String(list[at]?.id ?? ""))) at++;
  return at;
}

// Build the submenu entry editing-toolbar stores in its `menuCommands`.
function buildSubmenu(): MenuCommand {
  return {
    id: SUBMENU_ID,
    name: SUBMENU_NAME,
    icon: SUBMENU_ICON,
    menuType: SUBMENU_TYPE,
    SubmenuCommands: SUBMENU_COMMANDS.map((c) => ({
      id: `${PLUGIN_ID}:${c.id}`,
      name: t(c.nameKey),
      icon: c.icon,
    })),
  };
}

// editing-toolbar builds the visible top bar ONCE and reuses that DOM on later leaf/layout changes —
// so a settings write alone is invisible until an Obsidian reload. Force a fresh rebuild the way its
// own settings tab does: drop the toolbar cache + remove the live bar DOM, then re-trigger the
// layout handler that rebuilds it. Best-effort and feature-detected: if the internals differ we just
// skip and the change still shows after the next reload. (Verified live on v4.0.8.)
function refreshLiveToolbar(app: App, plugin: EditingToolbarLike): void {
  try {
    plugin.clearToolbarCache?.();
    const doc: Document = typeof activeDocument !== "undefined" ? activeDocument : document;
    doc.querySelectorAll(".editingToolbarModalBar").forEach((el) => el.remove());
    app.workspace.trigger("layout-change");
  } catch {
    /* best-effort: the change still appears on the next reload */
  }
}

/** Inject the compact "Image editing" submenu near the LEFT edge of editing-toolbar's bar (after a
 * leading undo/redo run, else front — so it stays inside the visible width) and force the live bar to
 * rebuild. Returns false on any failure. */
export async function addEditingToolbarButtons(app: App): Promise<boolean> {
  const plugin = getPlugin(app);
  if (!plugin?.settings) return false;
  try {
    const list: MenuCommand[] = plugin.settings.menuCommands ?? (plugin.settings.menuCommands = []);
    stripOurEntries(list);
    list.splice(insertIndexFor(list), 0, buildSubmenu());
    await plugin.saveSettings?.();
    refreshLiveToolbar(app, plugin);
    return true;
  } catch {
    return false;
  }
}

/** Remove our submenu (and any legacy buttons) and rebuild the live bar. Returns false on failure. */
export async function removeEditingToolbarButtons(app: App): Promise<boolean> {
  const plugin = getPlugin(app);
  if (!plugin?.settings?.menuCommands) return false;
  try {
    stripOurEntries(plugin.settings.menuCommands);
    await plugin.saveSettings?.();
    refreshLiveToolbar(app, plugin);
    return true;
  } catch {
    return false;
  }
}

/** Load-time self-heal / migration: when the integration is enabled, re-add the submenu only if it
 * is missing (editing-toolbar was reset) or in the legacy format (older `menuType`/icon set), so
 * existing users migrate to the horizontal compact row automatically. A correctly-formed entry is
 * left untouched — we don't fight a user who reordered it. No-op when disabled or editing-toolbar is
 * absent. */
export async function ensureEditingToolbarButtons(app: App, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const plugin = getPlugin(app);
  const list = plugin?.settings?.menuCommands;
  if (!list) return;
  const current = list.find((c) => c?.id === SUBMENU_ID);
  const kids = current?.SubmenuCommands;
  const upToDate =
    current?.name === SUBMENU_NAME &&
    current.menuType === SUBMENU_TYPE &&
    current.icon === SUBMENU_ICON &&
    Array.isArray(kids) &&
    kids.length === SUBMENU_COMMANDS.length &&
    kids.every((c, i) =>
      c?.id === `${PLUGIN_ID}:${SUBMENU_COMMANDS[i]?.id}` && c?.icon === SUBMENU_COMMANDS[i]?.icon);
  if (upToDate) return;
  await addEditingToolbarButtons(app);
}
