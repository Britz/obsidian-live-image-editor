import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { t } from "./i18n";
import type LiveImageEditorPlugin from "./main";
import { PresetWidths, DEFAULT_PRESET_WIDTHS } from "./styles-injector";
import {
  getEditingToolbarStatus, addEditingToolbarButtons, removeEditingToolbarButtons,
} from "./editing-toolbar-integration";
import { installBundledSnippet, resetBundledSnippet, isBundledSnippetInstalled } from "./snippet-scanner";

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
  editingToolbarEnabled: boolean;
  // Auto-normalize bare `![](…)` embeds to `{.lie-img}` on edit/navigation, so every
  // image renders uniformly (R0). The "Normalize images" commands do it on demand.
  autoNormalizeImages: boolean;
}

export const DEFAULT_SETTINGS: LieSettings = {
  showToolbar: true,
  showCaptions: false,
  alwaysShowLink: false, // default: auto-reveal (show on hover), not always shown
  presetWidths: { ...DEFAULT_PRESET_WIDTHS },
  disabledInternalClasses: [],
  disabledSnippetClasses: [],
  editingToolbarEnabled: false,
  autoNormalizeImages: true, // on by default; switchable off (rendering rework)
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

    containerEl.createEl("h2", { text: t("settingsTitle") });

    new Setting(containerEl)
      .setName(t("settingsToolbar"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showToolbar)
          .onChange(async (v) => { this.plugin.settings.showToolbar = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(t("settingsCaptions"))
      .setDesc(t("settingsCaptionsDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showCaptions)
          .onChange(async (v) => { this.plugin.settings.showCaptions = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(t("settingsRevealDefault"))
      .setDesc(t("settingsRevealDefaultDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.alwaysShowLink)
          .onChange(async (v) => { this.plugin.settings.alwaysShowLink = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(t("settingsAutoNormalize"))
      .setDesc(t("settingsAutoNormalizeDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoNormalizeImages)
          .onChange(async (v) => { this.plugin.settings.autoNormalizeImages = v; await this.plugin.saveSettings(); });
      });

    // Preset widths (F24)
    containerEl.createEl("h3", { text: t("settingsPresetWidths") });
    containerEl.createEl("p", { text: t("settingsPresetWidthsDesc"), cls: "setting-item-description" });
    for (const key of ["small", "medium", "large"] as const) {
      new Setting(containerEl)
        .setName(t(key))
        .addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(this.plugin.settings.presetWidths[key]))
            .onChange(async (v) => {
              const n = parseInt(v, 10);
              if (n > 0) { this.plugin.settings.presetWidths[key] = n; await this.plugin.saveSettings(); }
            });
        });
    }

    // Snippets section
    containerEl.createEl("h3", { text: t("settingsSnippets") });
    containerEl.createEl("p", { text: t("settingsSnippetsDesc"), cls: "setting-item-description" });

    // Bundled example snippets — install (opt-in) / reset (F16.1).
    void isBundledSnippetInstalled(this.plugin.app.vault).then((installed) => {
      new Setting(containerEl)
        .setName(t("settingsBundledSnippets"))
        .setDesc(t("settingsBundledSnippetsDesc"))
        .addButton((btn) => {
          btn.setButtonText(installed ? t("settingsBundledInstalled") : t("settingsBundledInstall"))
            .setDisabled(installed)
            .onClick(async () => {
              await installBundledSnippet(this.plugin.app.vault);
              new Notice(t("settingsBundledInstalledNotice"));
              await this.plugin.refreshSnippets();
              this.display();
            });
        })
        .addButton((btn) => {
          btn.setButtonText(t("settingsBundledReset"))
            .onClick(async () => {
              await resetBundledSnippet(this.plugin.app.vault);
              new Notice(t("settingsBundledResetNotice"));
              await this.plugin.refreshSnippets();
              this.display();
            });
        });
    });

    const snippetClasses = this.plugin.getSnippetClasses();
    if (snippetClasses.length === 0) {
      containerEl.createEl("p", { text: t("settingsNoSnippets"), cls: "setting-item-description" });
    } else {
      for (const sc of snippetClasses) {
        const isDisabled = this.plugin.settings.disabledSnippetClasses.includes(sc.className);
        new Setting(containerEl)
          .setName(sc.className)
          .setDesc(sc.sourceFile)
          .addToggle((toggle) => {
            toggle.setValue(!isDisabled)
              .onChange(async (enabled) => {
                if (enabled) {
                  this.plugin.settings.disabledSnippetClasses =
                    this.plugin.settings.disabledSnippetClasses.filter((c) => c !== sc.className);
                } else {
                  this.plugin.settings.disabledSnippetClasses.push(sc.className);
                }
                await this.plugin.saveSettings();
              });
          });
      }
    }

    new Setting(containerEl)
      .addButton((btn) => {
        btn.setButtonText(t("settingsRefresh"))
          .onClick(async () => { await this.plugin.refreshSnippets(); this.display(); });
      });

    // Editing Toolbar Integration (F23/T10): optional, off by default, version-gated.
    containerEl.createEl("h3", { text: t("settingsEditingToolbar") });
    const status = getEditingToolbarStatus(this.app);

    new Setting(containerEl)
      .setName("Status")
      .setDesc(
        status.installed
          ? `${t("settingsEditingToolbarInstalled")}${status.version ? ` (v${status.version})` : ""}`
          : t("settingsEditingToolbarNotInstalled")
      );

    if (status.installed && !status.tested) {
      const warn = containerEl.createEl("p", {
        text: t("settingsEditingToolbarVersionWarning"),
        cls: "setting-item-description",
      });
      warn.style.color = "var(--text-error)";
    }

    if (status.installed) {
      new Setting(containerEl)
        .setName(t("settingsEditingToolbarEnable"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.editingToolbarEnabled)
            .onChange(async (v) => {
              this.plugin.settings.editingToolbarEnabled = v;
              await this.plugin.saveSettings();
              if (v && status.tested) await addEditingToolbarButtons(this.app);
              if (!v) await removeEditingToolbarButtons(this.app);
              this.display();
            });
        });

      if (this.plugin.settings.editingToolbarEnabled && status.tested) {
        new Setting(containerEl)
          .addButton((btn) => {
            btn.setButtonText(t("settingsAddButtons"))
              .onClick(async () => { await addEditingToolbarButtons(this.app); });
          })
          .addButton((btn) => {
            btn.setButtonText(t("settingsRemoveButtons"))
              .onClick(async () => { await removeEditingToolbarButtons(this.app); });
          });
      }
    }
  }
}
