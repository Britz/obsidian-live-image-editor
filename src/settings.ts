import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";
import type LiveImageEditorPlugin from "./main";

export interface LieSettings {
  showToolbar: boolean;
  convertWikiLinks: boolean;
  disabledInternalClasses: string[];
  disabledSnippetClasses: string[];
  editingToolbarEnabled: boolean;
  language: string;
}

export const DEFAULT_SETTINGS: LieSettings = {
  showToolbar: true,
  convertWikiLinks: true,
  disabledInternalClasses: [],
  disabledSnippetClasses: [],
  editingToolbarEnabled: false,
  language: "auto",
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

    // General
    new Setting(containerEl)
      .setName(t("settingsToolbar"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showToolbar)
          .onChange(async (v) => {
            this.plugin.settings.showToolbar = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settingsConvertWikiLinks"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.convertWikiLinks)
          .onChange(async (v) => {
            this.plugin.settings.convertWikiLinks = v;
            await this.plugin.saveSettings();
          });
      });

    // Snippets section
    containerEl.createEl("h3", { text: t("settingsSnippets") });
    containerEl.createEl("p", {
      text: t("settingsSnippetsDesc"),
      cls: "setting-item-description",
    });

    const snippetClasses = this.plugin.getSnippetClasses();
    if (snippetClasses.length === 0) {
      containerEl.createEl("p", {
        text: "No image classes detected in vault snippets.",
        cls: "setting-item-description",
      });
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
          .onClick(async () => {
            await this.plugin.refreshSnippets();
            this.display();
          });
      });

    // Editing Toolbar Integration
    containerEl.createEl("h3", { text: t("settingsEditingToolbar") });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const etPlugin = (this.app as Record<string, any>).plugins?.getPlugin?.("editing-toolbar");
    const etInstalled = !!etPlugin;

    new Setting(containerEl)
      .setName("Status")
      .setDesc(etInstalled ? t("settingsEditingToolbarInstalled") : t("settingsEditingToolbarNotInstalled"));

    if (etInstalled) {
      new Setting(containerEl)
        .setName(t("settingsEditingToolbarEnable"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.editingToolbarEnabled)
            .onChange(async (v) => {
              this.plugin.settings.editingToolbarEnabled = v;
              await this.plugin.saveSettings();
            });
        });
    }

    // Language
    containerEl.createEl("h3", { text: t("settingsLanguage") });
    new Setting(containerEl)
      .setName(t("settingsLanguage"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", t("settingsLanguageAuto"))
          .addOption("en", "English")
          .addOption("de", "Deutsch")
          .setValue(this.plugin.settings.language)
          .onChange(async (v) => {
            this.plugin.settings.language = v;
            await this.plugin.saveSettings();
          });
      });
  }
}
