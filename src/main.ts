import { Plugin, MarkdownView, MarkdownPostProcessorContext, Notice } from "obsidian";
import { ImageTransform, FilterData, parseAltText } from "./transforms";
import { applyTransformToImage } from "./renderer";
import { ImageToolbar, ToolbarAction } from "./toolbar";
import { findImageInSource, updateImageSource } from "./image-resolver";
import { SizeModal } from "./size-modal";
import { CropEditor } from "./crop-editor";
import { FilterPanel } from "./filter-panel";
import { exportImage } from "./export";
import { scanSnippets, SnippetClass } from "./snippet-scanner";
import { StylesInjector } from "./styles-injector";
import { registerCommands, CommandHandler } from "./commands";
import { LieSettings, DEFAULT_SETTINGS, LieSettingTab } from "./settings";
import { setLocale, detectLocale } from "./i18n";

export default class LiveImageEditorPlugin extends Plugin {
  settings: LieSettings = DEFAULT_SETTINGS;
  private toolbar = new ImageToolbar();
  private stylesInjector = new StylesInjector();
  private snippetClasses: SnippetClass[] = [];
  private activeImage: HTMLImageElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initLocale();
    this.stylesInjector.inject(this.settings.disabledInternalClasses);

    this.addSettingTab(new LieSettingTab(this.app, this));
    this.registerMarkdownPostProcessor(this.postProcessor.bind(this));
    this.registerImageSelectionHandler();
    this.registerCommands();

    this.app.workspace.onLayoutReady(async () => {
      await this.refreshSnippets();
    });
  }

  onunload(): void {
    this.toolbar.hide();
    this.stylesInjector.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.stylesInjector.inject(this.settings.disabledInternalClasses);
    this.initLocale();
  }

  getSnippetClasses(): SnippetClass[] {
    return this.snippetClasses;
  }

  async refreshSnippets(): Promise<void> {
    this.snippetClasses = await scanSnippets(this.app.vault, "");
  }

  private initLocale(): void {
    const lang = this.settings.language === "auto" ? detectLocale() : this.settings.language;
    setLocale(lang);
  }

  private postProcessor(el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    const images = el.querySelectorAll("img");
    for (const img of Array.from(images)) {
      const alt = img.getAttribute("alt") ?? "";
      if (!alt) continue;

      const transform = parseAltText(alt);
      if (this.hasTransforms(transform)) {
        applyTransformToImage(img as HTMLImageElement, transform);
      }
    }
  }

  private registerImageSelectionHandler(): void {
    this.registerDomEvent(document, "click", (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;

      if (target.tagName === "IMG" && target.closest(".markdown-reading-view, .markdown-source-view")) {
        this.onImageSelected(target as HTMLImageElement);
      } else if (!target.closest(".lie-toolbar")) {
        this.toolbar.hide();
        this.activeImage = null;
      }
    });
  }

  private onImageSelected(img: HTMLImageElement): void {
    if (!this.settings.showToolbar) return;

    this.activeImage = img;
    this.toolbar.show(img, this.buildToolbarActions());
  }

  private buildToolbarActions(): ToolbarAction[] {
    return [
      { icon: "rotate-cw", titleKey: "rotateCw", action: () => this.rotateCw() },
      { icon: "rotate-ccw", titleKey: "rotateCcw", action: () => this.rotateCcw() },
      { icon: "flip-horizontal", titleKey: "flipH", action: () => this.flipH() },
      { icon: "flip-vertical", titleKey: "flipV", action: () => this.flipV() },
      { icon: "crop", titleKey: "crop", action: () => this.crop() },
      { icon: "sliders-horizontal", titleKey: "filters", action: () => this.openFilters() },
      { icon: "minus", titleKey: "smaller", action: () => this.resize(0.8) },
      { icon: "plus", titleKey: "larger", action: () => this.resize(1.25) },
      { icon: "maximize", titleKey: "customSize", action: () => this.customSize() },
      { icon: "layout-list", titleKey: "inlineBlock", action: () => this.toggleInline() },
      { icon: "chevron-down", titleKey: "snippets", action: () => this.addClass() },
      { icon: "download", titleKey: "export", action: () => this.exportImage() },
      { icon: "undo-2", titleKey: "reset", action: () => this.reset() },
    ];
  }

  private registerCommands(): void {
    const handler: CommandHandler = {
      getActiveImage: () => this.activeImage,
      rotateCw: () => this.rotateCw(),
      rotateCcw: () => this.rotateCcw(),
      flipH: () => this.flipH(),
      flipV: () => this.flipV(),
      crop: () => this.crop(),
      openFilters: () => this.openFilters(),
      sizeSmall: () => this.applyClass("lie-small"),
      sizeMedium: () => this.applyClass("lie-medium"),
      sizeLarge: () => this.applyClass("lie-large"),
      classLeft: () => this.applyClass("lie-left"),
      classRight: () => this.applyClass("lie-right"),
      classCenter: () => this.applyClass("lie-center"),
      addClass: () => this.addClass(),
      reset: () => this.reset(),
      customSize: () => this.customSize(),
      toggleInline: () => this.toggleInline(),
      exportImage: () => this.exportImage(),
    };
    registerCommands(this, handler);
  }

  private modifyTransform(modifier: (t: ImageTransform) => void): void {
    if (!this.activeImage) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const transform = parseAltText(location.altText);
    modifier(transform);

    updateImageSource(editor, location, transform, this.settings.convertWikiLinks);
    applyTransformToImage(this.activeImage, transform);
  }

  private rotateCw(): void {
    this.modifyTransform((t) => {
      const deg = ((t.rotate ?? 0) + 90) % 360;
      t.rotate = deg || undefined;
    });
  }

  private rotateCcw(): void {
    this.modifyTransform((t) => {
      const deg = ((t.rotate ?? 0) - 90 + 360) % 360;
      t.rotate = deg || undefined;
    });
  }

  private flipH(): void {
    this.modifyTransform((t) => { t.flipH = !t.flipH; });
  }

  private flipV(): void {
    this.modifyTransform((t) => { t.flipV = !t.flipV; });
  }

  private resize(factor: number): void {
    this.modifyTransform((t) => {
      const current = t.width ?? this.activeImage?.naturalWidth ?? 300;
      t.width = Math.round(current * factor);
      t.height = undefined;
    });
  }

  private toggleInline(): void {
    this.modifyTransform((t) => { t.inline = !t.inline; });
  }

  private applyClass(cls: string): void {
    this.modifyTransform((t) => {
      const idx = t.classes.indexOf(cls);
      if (idx >= 0) {
        t.classes.splice(idx, 1);
      } else {
        t.classes.push(cls);
      }
    });
  }

  private reset(): void {
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;
    const empty: ImageTransform = { classes: [] };
    updateImageSource(editor, location, empty, this.settings.convertWikiLinks);
    applyTransformToImage(this.activeImage, empty);
  }

  private customSize(): void {
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.altText);

    new SizeModal(this.app, current.width, current.height, (w, h) => {
      this.modifyTransform((t) => {
        t.width = w;
        t.height = h;
      });
    }).open();
  }

  private crop(): void {
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.altText);

    const cropEditor = new CropEditor(
      this.activeImage,
      current.crop,
      (cropData) => {
        this.modifyTransform((t) => { t.crop = cropData; });
      },
      () => {}
    );
    cropEditor.open();
  }

  private openFilters(): void {
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.altText);
    const img = this.activeImage;

    new FilterPanel(
      img,
      current.filter,
      (filter: FilterData) => {
        this.modifyTransform((t) => {
          t.filter = Object.keys(filter).length ? filter : undefined;
        });
      },
      () => {}
    ).open(img);
  }

  private addClass(): void {
    if (!this.activeImage) return;

    const availableClasses = this.snippetClasses
      .filter((sc) => !this.settings.disabledSnippetClasses.includes(sc.className));

    if (availableClasses.length === 0) {
      new Notice("No CSS classes found in vault snippets");
      return;
    }

    const menu = document.createElement("div");
    menu.classList.add("lie-class-dropdown");

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;
    const current = parseAltText(location.altText);

    for (const sc of availableClasses) {
      const item = document.createElement("button");
      item.classList.add("lie-class-dropdown-item");
      const isActive = current.classes.includes(sc.className);
      if (isActive) item.classList.add("is-active");
      item.textContent = sc.className;
      item.addEventListener("click", () => {
        this.applyClass(sc.className);
        menu.remove();
      });
      menu.appendChild(item);
    }

    const rect = this.activeImage.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${rect.top - 8}px`;
    menu.style.left = `${rect.left + rect.width / 2}px`;
    menu.style.transform = "translate(-50%, -100%)";
    menu.style.zIndex = "1001";
    document.body.appendChild(menu);

    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
  }

  private async exportImage(): Promise<void> {
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const transform = parseAltText(location.altText);

    try {
      const path = await exportImage(
        this.activeImage,
        transform,
        this.app.vault,
        location.filename
      );
      new Notice(`Exported to ${path}`);
    } catch (e) {
      new Notice(`Export failed: ${e}`);
    }
  }

  private hasTransforms(t: ImageTransform): boolean {
    return !!(t.width || t.height || t.rotate || t.flipH || t.flipV ||
      t.crop || t.filter || t.classes.length || t.inline);
  }
}
