import { App, PluginSettingTab, Setting, Notice, Modal, setIcon, SearchComponent } from "obsidian";
import { t } from "./i18n";
import type LiveImageEditorPlugin from "./main";
import { PresetWidths, DEFAULT_PRESET_WIDTHS } from "./styles-injector";
import {
  getEditingToolbarStatus, addEditingToolbarButtons, removeEditingToolbarButtons, EDITING_TOOLBAR_ID,
} from "./editing-toolbar-integration";
import {
  scanSnippetFiles, restoreBundledClass, getBundledSnippetState,
  installBundledSnippet, resetBundledSnippet, uninstallBundledSnippet,
} from "./snippet-scanner";
import { findCollisions } from "./snippet-classify";

// Pull a term from OBSIDIAN's OWN translations (`window.i18next`) so feature names read exactly as
// Obsidian labels them — and auto-localize to any language Obsidian ships, even ones this plugin
// doesn't. i18next returns the key unchanged on a miss, so that (or no store) → our own fallback.
function obsidianTerm(key: string, fallback: string): string {
  const i18n = (window as unknown as { i18next?: { t?: (k: string) => string } }).i18next;
  const value = i18n?.t?.(key);
  return value && value !== key ? value : fallback;
}

// Our translated string with Obsidian's native feature terms spliced in: `{snippets}` → Obsidian's
// "CSS snippets" label, `{appearance}` → its "Appearance" label (both in the current Obsidian locale).
function tt(key: Parameters<typeof t>[0]): string {
  return t(key)
    .replace(/\{snippets\}/g, obsidianTerm("setting.appearance.option-css-snippets", t("termCssSnippets")))
    .replace(/\{appearance\}/g, obsidianTerm("setting.appearance.name", t("termAppearance")));
}

// Obsidian's undocumented settings-modal API surface we navigate to (feature-detected at call sites).
interface SettingApi {
  open?: () => void;
  openTabById?: (id: string) => void;
  activeTab?: { containerEl?: HTMLElement };
}

// A minimal yes/no confirmation — uninstalling deletes a file, so we confirm first.
class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly message: string,
    private readonly confirmLabel: string,
    // Accepts an async confirm handler (the bundled-snippet uninstall is async) — typing it
    // `() => void` would make passing an async fn a misused Promise. The modal fires-and-forgets it.
    private readonly onConfirm: () => void | Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.confirmLabel).setWarning()
        .onClick(() => { this.close(); void this.onConfirm(); }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface LieSettings {
  showToolbar: boolean;
  showCaptions: boolean;
  // The link-source reveal MODE (F8/F20): always-shown vs. auto (shown on hover). This
  // is INDEPENDENT of the `<>` control, which temporarily HIDES the link per image
  // regardless of the mode (not persisted per image).
  alwaysShowLink: boolean;
  // The configurable preset widths for small / medium / large (F24/F20).
  presetWidths: PresetWidths;
  disabledInternalClasses: string[];
  disabledSnippetClasses: string[];
  // Master switch for the snippet/decoration-class feature (AB19): the toolbar's class picker and
  // the settings class overview. Off leaves alignment/inline (core layout) and already-applied
  // classes untouched — Obsidian's own enabled snippet still renders them.
  cssClassesEnabled: boolean;
  editingToolbarEnabled: boolean;
  // Tall-float cap: a floated image taller than CM6's ~250px render margin stacks as a
  // non-floated block (in both views) so it can't derender on scroll in Live Preview.
  // Off = always wrap (permissive), accepting the LP-only disappear glitch.
  tallFloatSafe: boolean;
  // A11y: visible outlines on the (flat-by-default) toolbar buttons (Feature 2). "auto" follows the
  // OS/Obsidian accessibility signal (prefers-contrast / forced-colors — the closest web-detectable
  // proxy for the macOS/iOS "Button Shapes" flag, which is NOT exposed to web content); "always"
  // forces outlines; "never" suppresses them even under high contrast.
  buttonOutlines: "auto" | "always" | "never";
}

export const DEFAULT_SETTINGS: LieSettings = {
  showToolbar: true,
  showCaptions: false,
  alwaysShowLink: false, // default: auto-reveal (show on hover), not always shown
  presetWidths: { ...DEFAULT_PRESET_WIDTHS },
  disabledInternalClasses: [],
  disabledSnippetClasses: [],
  cssClassesEnabled: true, // preserve the prior always-on behaviour
  editingToolbarEnabled: false,
  tallFloatSafe: false, // off by default = permissive float (always wrap); on = safe (stack tall floats)
  buttonOutlines: "auto", // follow the OS/Obsidian accessibility signal by default
};

export class LieSettingTab extends PluginSettingTab {
  plugin: LiveImageEditorPlugin;

  constructor(app: App, plugin: LiveImageEditorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderGeneral(containerEl);
    this.renderSizePresets(containerEl);
    this.renderCssSection(containerEl);
    this.renderEditingToolbar(containerEl);
  }

  // A native Obsidian setting "card": `div.setting-group` (with the heading inside) → `div.setting-
  // items` (the rounded grey box Obsidian/the theme styles uniformly — see the core CSS-snippets and
  // community-plugins pages). Returns the `.setting-items` to fill with rows.
  private cardGroup(parent: HTMLElement, heading?: string,
    opts: { desc?: string; markerClass?: string; icons?: (h: Setting) => void } = {}): HTMLElement {
    const group = parent.createDiv("setting-group" + (opts.markerClass ? ` ${opts.markerClass}` : ""));
    if (heading) {
      const h = new Setting(group).setName(heading).setHeading();
      if (opts.desc) h.setDesc(opts.desc);
      opts.icons?.(h);
    }
    return group.createDiv("setting-items");
  }

  // A native Obsidian "info" callout (admonition) for a section-level note — Obsidian styles
  // `.callout[data-callout="info"]` globally, so it picks up the info colour/tint in the settings too.
  private renderInfoCallout(parent: HTMLElement, text: string): void {
    const callout = parent.createDiv({ cls: "callout lie-info-callout", attr: { "data-callout": "info" } });
    const title = callout.createDiv({ cls: "callout-title" });
    setIcon(title.createDiv({ cls: "callout-icon" }), "info");
    title.createDiv({ cls: "callout-title-inner", text: t("settingsInfoTitle") });
    callout.createDiv({ cls: "callout-content" }).createEl("p", { text });
  }

  // ── General — the four toggles in one card ─────────────────────────────────────────────────
  private renderGeneral(c: HTMLElement): void {
    const items = this.cardGroup(c, t("settingsGeneral"));

    new Setting(items)
      .setName(t("settingsToolbar"))
      .addToggle((tg) => tg.setValue(this.plugin.settings.showToolbar)
        .onChange(async (v) => { this.plugin.settings.showToolbar = v; await this.plugin.saveSettings(); }));

    new Setting(items)
      .setName(t("settingsCaptions"))
      .setDesc(t("settingsCaptionsDesc"))
      .addToggle((tg) => tg.setValue(this.plugin.settings.showCaptions)
        .onChange(async (v) => { this.plugin.settings.showCaptions = v; await this.plugin.saveSettings(); }));

    new Setting(items)
      .setName(t("settingsRevealDefault"))
      .setDesc(t("settingsRevealDefaultDesc"))
      .addToggle((tg) => tg.setValue(this.plugin.settings.alwaysShowLink)
        .onChange(async (v) => { this.plugin.settings.alwaysShowLink = v; await this.plugin.saveSettings(); }));

    new Setting(items)
      .setName(t("settingsTallFloat"))
      .setDesc(t("settingsTallFloatDesc"))
      .addToggle((tg) => tg.setValue(this.plugin.settings.tallFloatSafe)
        .onChange(async (v) => { this.plugin.settings.tallFloatSafe = v; await this.plugin.saveSettings(); }));

    new Setting(items)
      .setName(t("settingsButtonOutlines"))
      .setDesc(t("settingsButtonOutlinesDesc"))
      .addDropdown((dd) => dd
        .addOption("auto", t("settingsButtonOutlinesAuto"))
        .addOption("always", t("settingsButtonOutlinesAlways"))
        .addOption("never", t("settingsButtonOutlinesNever"))
        .setValue(this.plugin.settings.buttonOutlines)
        .onChange(async (v) => {
          this.plugin.settings.buttonOutlines = v as LieSettings["buttonOutlines"];
          await this.plugin.saveSettings();
        }));
  }

  // ── Size presets — Small / Medium / Large rows in one card (F24) ───────────────────────────
  private renderSizePresets(c: HTMLElement): void {
    const items = this.cardGroup(c, t("settingsPresetWidths"));

    for (const key of ["small", "medium", "large"] as const) {
      new Setting(items)
        .setName(t(key))
        .setDesc(t("settingsPresetWidthRowDesc"))
        .addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(this.plugin.settings.presetWidths[key]))
            .onChange(async (v) => {
              const n = parseInt(v, 10);
              if (n > 0) { this.plugin.settings.presetWidths[key] = n; await this.plugin.saveSettings(); }
            });
        });
    }
  }

  // ── CSS classes — a 3-state section (AB19) ─────────────────────────────────────────────────
  //   A. No snippet enabled in Obsidian → greyed master toggle + error + link to snippet management.
  //   B. Feature off in the plugin       → just the master toggle.
  //   C. Feature on                       → install status + the snippet-manager-style class overview.
  private renderCssSection(c: HTMLElement): void {
    const enabledSnippets = (this.app as unknown as { customCss?: { enabledSnippets?: Set<string> } })
      .customCss?.enabledSnippets;
    const obsidianHasSnippets = !!enabledSnippets && enabledSnippets.size > 0;

    // State A — Obsidian renders nothing (no enabled snippet): grey the toggle and route the user to
    // Obsidian's snippet management to enable one (Q1).
    if (!obsidianHasSnippets) {
      const items = this.cardGroup(c, t("settingsCssClasses"));
      const s = new Setting(items)
        .setName(t("settingsCssEnable"))
        .setDesc(tt("settingsCssObsidianOff"))
        .addToggle((tg) => tg.setValue(this.plugin.settings.cssClassesEnabled).setDisabled(true));
      s.settingEl.addClass("lie-css-disabled");
      c.createEl("p", { cls: "setting-item-description lie-settings-warning", text: tt("settingsCssObsidianOffHint") });
      new Setting(c).addButton((b) => b.setButtonText(tt("settingsOpenSnippetMgr")).setCta()
        .onClick(() => this.openSnippetManager()));
      return;
    }

    // Master toggle (always shown in B/C).
    const items = this.cardGroup(c, t("settingsCssClasses"));
    new Setting(items)
      .setName(t("settingsCssEnable"))
      .setDesc(tt("settingsCssEnableDesc"))
      .addToggle((tg) => tg.setValue(this.plugin.settings.cssClassesEnabled)
        .onChange(async (v) => {
          this.plugin.settings.cssClassesEnabled = v;
          await this.plugin.saveSettings();
          await this.plugin.refreshSnippets();
          this.display();
        }));

    // A section-level note — it applies to BOTH the master toggle and the per-class toggles below.
    this.renderInfoCallout(c, tt("settingsCssInfo"));

    // State B — feature off: install/overview stay hidden.
    if (!this.plugin.settings.cssClassesEnabled) return;

    // State C — the install row joins the master card; the overview renders below (async, in order).
    const overviewEl = c.createDiv();
    void this.renderInstallField(items);
    void this.renderClassOverview(overviewEl, enabledSnippets);
  }

  // Our bundled example file's lifecycle (file-level, alongside the per-class restore in the list):
  //   missing → Install · modified → Reset to shipped (+ Uninstall) · unchanged → just Uninstall
  //   (no redundant "Installed" label — being uninstallable already says it's installed).
  // Uninstall deletes the file, so it confirms first (more sternly when the file carries edits).
  private async renderInstallField(el: HTMLElement): Promise<void> {
    const vault = this.plugin.app.vault;
    const state = await getBundledSnippetState(vault);
    const setting = new Setting(el)
      .setName(tt("settingsBundledSnippets"))
      .setDesc(state === "modified" ? t("settingsBundledModified") : tt("settingsBundledSnippetsDesc"));

    const after = async (notice: string): Promise<void> => {
      new Notice(notice);
      await this.plugin.refreshSnippets();
      this.display();
    };

    if (state === "missing") {
      setting.addButton((b) => b.setButtonText(t("settingsBundledInstall")).setCta()
        .onClick(async () => { await installBundledSnippet(vault); await after(tt("settingsBundledInstalledNotice")); }));
      return;
    }

    if (state === "modified") {
      setting.addButton((b) => b.setButtonText(t("settingsBundledReset"))
        .onClick(async () => { await resetBundledSnippet(vault); await after(t("settingsBundledResetNotice")); }));
    }

    setting.addButton((b) => b.setButtonText(t("settingsBundledUninstall")).setWarning()
      .onClick(() => new ConfirmModal(
        this.app,
        state === "modified" ? t("settingsBundledUninstallModifiedConfirm") : t("settingsBundledUninstallConfirm"),
        t("settingsBundledUninstall"),
        async () => { await uninstallBundledSnippet(vault); await after(t("settingsBundledUninstalledNotice")); }
      ).open()));
  }

  // The class overview as ONE group, like Obsidian's community-plugins / CSS-snippets list: a heading
  // with refresh + open-management icons, a native search box, then ALL classes in a single
  // `.setting-items` card. Rows are ORDERED by source file (our bundled file first), each showing its
  // file as the description below the name (the Setting-list idiom). Our own classes are set off with
  // an accent. Our file's classes also carry a changed/deleted marker + a per-class restore.
  private async renderClassOverview(el: HTMLElement, enabledSnippets: Set<string>): Promise<void> {
    const files = await scanSnippetFiles(this.plugin.app.vault, enabledSnippets);
    // Our bundled file floats to the top; the rest keep their scan (folder) order.
    const ordered = [...files].sort((a, b) => Number(b.isOurs) - Number(a.isOurs));

    const group = el.createDiv("setting-group lie-class-overview");
    new Setting(group)
      .setName(t("settingsClassList"))
      .setHeading()
      .addExtraButton((b) => b.setIcon("refresh-cw").setTooltip(t("settingsRefresh"))
        .onClick(async () => { await this.plugin.refreshSnippets(); this.display(); }))
      .addExtraButton((b) => b.setIcon("settings").setTooltip(tt("settingsOpenSnippetMgr"))
        .onClick(() => this.openSnippetManager()));

    const searchWrap = group.createDiv("setting-group-search");
    const searchCmp = new SearchComponent(searchWrap);
    searchCmp.setPlaceholder(t("settingsClassSearch"));

    const items = group.createDiv("setting-items");

    const totalClasses = files.reduce((n, f) => n + f.classes.length, 0);
    if (totalClasses === 0) {
      items.createDiv({ cls: "setting-item-description lie-class-empty", text: t("settingsNoSnippets") });
      return;
    }

    // Collisions: a class ACTIVE (user-enabled, not deleted) in more than one file — two enabled
    // snippets fighting over `img.NAME` (Decision: warn, last-loaded wins).
    const disabled = () => this.plugin.settings.disabledSnippetClasses;
    const collisions = findCollisions(files.map((f) => ({
      fileName: f.fileName,
      classNames: f.classes
        .filter((cl) => cl.status !== "deleted" && !disabled().includes(cl.className))
        .map((cl) => cl.className),
    })));

    const rows: { row: HTMLElement; hay: string }[] = [];

    for (const file of ordered) {
      for (const cls of file.classes) {
        const isDeleted = cls.status === "deleted";
        const isChanged = cls.status === "changed";
        const setting = new Setting(items);
        setting.settingEl.addClass("lie-class-item");
        if (file.isOurs) setting.settingEl.addClass("lie-class-ours");

        const icon = setting.nameEl.createSpan({ cls: "lie-class-icon" });
        setIcon(icon, "braces");
        const nameSpan = setting.nameEl.createSpan({ cls: "lie-class-name", text: cls.className });

        if (isDeleted) {
          nameSpan.addClass("lie-class-deleted");
          setting.nameEl.createSpan({ cls: "lie-class-tag", text: ` (${t("settingsClassDeleted")})` });
        } else if (isChanged) {
          nameSpan.addClass("lie-class-changed");
          setting.nameEl.createSpan({ cls: "lie-class-tag", text: ` (${t("settingsClassChanged")})` });
        }

        // The source file is the per-row info (below the name); a collision adds a warning line.
        setting.descEl.createDiv({ cls: "lie-class-file", text: file.fileName });
        if (collisions.has(cls.className)) {
          setting.descEl.createDiv({ cls: "lie-class-collision", text: t("settingsClassCollision") });
        }

        // Per-class restore — only for OUR file's changed/deleted shipped classes.
        if (file.isOurs && (isDeleted || isChanged)) {
          setting.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip(t("settingsClassRestore"))
            .onClick(async () => {
              await restoreBundledClass(this.plugin.app.vault, cls.className);
              await this.plugin.refreshSnippets();
              this.display();
            }));
        }

        // Enable toggle (governs the toolbar picker). A deleted class has nothing to offer — no toggle.
        if (!isDeleted) {
          setting.addToggle((tg) => tg.setValue(!disabled().includes(cls.className))
            .onChange(async (enabled) => {
              const list = this.plugin.settings.disabledSnippetClasses;
              if (enabled) this.plugin.settings.disabledSnippetClasses = list.filter((cc) => cc !== cls.className);
              else if (!list.includes(cls.className)) list.push(cls.className);
              await this.plugin.saveSettings();
            }));
        }

        rows.push({ row: setting.settingEl, hay: `${cls.className} ${file.fileName}`.toLowerCase() });
      }
    }

    // Search: hide rows that match neither the class nor the file name.
    searchCmp.onChange((value) => {
      const q = value.trim().toLowerCase();
      for (const r of rows) r.row.toggleClass("lie-class-hidden", !!q && !r.hay.includes(q));
    });
  }

  private settingApi(): SettingApi | undefined {
    return (this.app as unknown as { setting?: SettingApi }).setting;
  }

  // Open Obsidian's settings on the Appearance tab AND scroll to the CSS-snippets section (it's the
  // section whose heading carries reload/folder action icons — language-independent; falls back to the
  // last section). Feature-detected — the `setting` API is undocumented, so we no-op on shape changes.
  private openSnippetManager(): void {
    const api = this.settingApi();
    try {
      api?.open?.();
      api?.openTabById?.("appearance");
      // Defer past Obsidian's own open-tab scroll reset (a bare rAF fires too early and gets undone).
      window.setTimeout(() => {
        const root = api?.activeTab?.containerEl;
        if (!root) return;
        const headings = Array.from(root.querySelectorAll<HTMLElement>(".setting-item-heading"));
        const snippets = headings.reverse()
          .find((h) => h.querySelector(".setting-item-control .extra-setting-button"));
        (snippets ?? (root.lastElementChild as HTMLElement | null))?.scrollIntoView({ block: "start" });
      }, 150);
    } catch { /* undocumented API — best-effort */ }
  }

  // Open the Community-plugins settings tab (to enable an installed-but-disabled plugin). The list
  // rows carry no id attribute, so when a pluginId is given we scroll to the row by its manifest
  // display name (deferred past the open-tab scroll reset).
  private openCommunityPlugins(pluginId?: string): void {
    const api = this.settingApi();
    try {
      api?.open?.();
      api?.openTabById?.("community-plugins");
      if (!pluginId) return;
      const name = (this.app as unknown as { plugins?: { manifests?: Record<string, { name?: string }> } })
        .plugins?.manifests?.[pluginId]?.name;
      if (!name) return;
      window.setTimeout(() => {
        const root = api?.activeTab?.containerEl;
        const row = root && Array.from(root.querySelectorAll<HTMLElement>(".installed-plugins-container .setting-item"))
          .find((r) => r.querySelector(".setting-item-name")?.textContent === name);
        row?.scrollIntoView({ block: "center" });
      }, 150);
    } catch { /* best-effort */ }
  }

  // Open the community-plugin store at a specific plugin (to install it); falls back to the tab.
  private openPluginStore(id: string): void {
    try { window.open(`obsidian://show-plugin?id=${id}`); } catch { this.openCommunityPlugins(); }
  }

  // ── Editing-toolbar integration (F23/T10) — ONE entry, three states ────────────────────────
  //   not installed → link to the community-plugin store · installed-but-disabled → link to the
  //   community-plugins settings · enabled → the integration on/off toggle.
  private renderEditingToolbar(c: HTMLElement): void {
    const status = getEditingToolbarStatus(this.app);
    const items = this.cardGroup(c, t("settingsEditingToolbar"), { markerClass: "lie-et-section" });
    const setting = new Setting(items).setName(t("settingsEditingToolbarEnable"));

    if (!status.installed) {
      setting.setDesc(t("settingsEditingToolbarNotInstalled"));
      setting.addButton((b) => b.setButtonText(t("settingsOpenPluginStore")).setCta()
        .onClick(() => this.openPluginStore(EDITING_TOOLBAR_ID)));
      return;
    }

    if (!status.enabled) {
      setting.setDesc(t("settingsEditingToolbarDisabled"));
      setting.addButton((b) => b.setButtonText(t("settingsOpenPluginSettings")).setCta()
        .onClick(() => this.openCommunityPlugins(EDITING_TOOLBAR_ID)));
      return;
    }

    // Enabled: always show the version. A tested version gets the integration toggle (adds/removes our
    // toolbar as one submenu); an untested version gets an orange unsupported-version warning instead.
    setting.setDesc(`${t("settingsEditingToolbarInstalled")}${status.version ? ` (v${status.version})` : ""}`);
    if (status.tested) {
      setting.addToggle((toggle) => toggle.setValue(this.plugin.settings.editingToolbarEnabled)
        .onChange(async (v) => {
          this.plugin.settings.editingToolbarEnabled = v;
          await this.plugin.saveSettings();
          if (v) await addEditingToolbarButtons(this.app);
          else await removeEditingToolbarButtons(this.app);
        }));
    } else {
      setting.descEl.createDiv({ cls: "lie-version-warning", text: t("settingsEditingToolbarVersionWarning") });
    }
  }
}
