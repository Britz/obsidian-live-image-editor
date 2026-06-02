import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";
import type LiveImageEditorPlugin from "./main";
import {
  getEditingToolbarStatus, addEditingToolbarButtons, removeEditingToolbarButtons,
} from "./editing-toolbar-integration";

export interface LieSettings {
  showToolbar: boolean;
  showCaptions: boolean;
  disabledInternalClasses: string[];
  disabledSnippetClasses: string[];
  editingToolbarEnabled: boolean;
}

export const DEFAULT_SETTINGS: LieSettings = {
  showToolbar: true,
  showCaptions: false,
  disabledInternalClasses: [],
  disabledSnippetClasses: [],
  editingToolbarEnabled: false,
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
      .setName(t("settingsCaptions"))
      .setDesc(t("settingsCaptionsDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showCaptions)
          .onChange(async (v) => {
            this.plugin.settings.showCaptions = v;
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

    // Editing Toolbar Integration (T7/F12): optional, off by default, version-gated.
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
              // Applying buttons only when the version is tested; otherwise the
              // toggle just records intent (warning shown above).
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
