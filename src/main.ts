import { Plugin, MarkdownView, MarkdownPostProcessorContext, Notice, Editor, TFile } from "obsidian";
import {
  ImageTransform, FilterData, parseAltText, serializeTransform,
  getRotation, setRotation, toggleFlipH, toggleFlipV, getFilter, setFilter,
  setPresetWidth, PresetKey,
} from "./transforms";
import { applyTransformToImage, applyFilterPreview, unwrapBox } from "./renderer";
import { ImageToolbar, ToolbarItem, ToolbarButton, ToolbarGroup } from "./toolbar";
import { findImageInSource, findImageInText, getImageFilename, ImageLocation } from "./image-resolver";
import { CropEditor } from "./crop-editor";
import { FilterPanel } from "./filter-panel";
import { AnchoredSubmenu } from "./anchored-submenu";
import { buildSizeBody, SizeState } from "./size-submenu";
import { renderTransformedImage, suggestExportPath, saveExport } from "./export";
import { scanSnippets, SnippetClass } from "./snippet-scanner";
import { StylesInjector } from "./styles-injector";
import { registerCommands, CommandHandler } from "./commands";
import { LieSettings, DEFAULT_SETTINGS, LieSettingTab } from "./settings";
import { createLivePreviewExtension, refreshDecorations } from "./live-preview";
import { captionFromAlt, createCaption, CaptionHandle } from "./caption";
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setLocale, detectLocale, t } from "./i18n";
import { convertEmbedLine, desiredFormat, LinkFormat } from "./link-format";

export default class LiveImageEditorPlugin extends Plugin {
  settings: LieSettings = DEFAULT_SETTINGS;
  private toolbar = new ImageToolbar();
  private stylesInjector = new StylesInjector();
  private snippetClasses: SnippetClass[] = [];
  private activeImage: HTMLImageElement | null = null;
  private hoverShown = false; // true when the floating toolbar was opened by hover (so it dismisses on hover-out)
  private filterPanel: FilterPanel | null = null;
  private submenu: AnchoredSubmenu | null = null;
  private cropEditor: CropEditor | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initLocale();
    this.stylesInjector.inject(this.settings.disabledInternalClasses, this.settings.presetWidths);

    this.addSettingTab(new LieSettingTab(this.app, this));
    this.registerMarkdownPostProcessor(this.postProcessor.bind(this));
    this.registerImageSelectionHandler();
    this.registerToolbarDismissHandlers();
    this.registerCommands();

    this.registerEvent(this.app.workspace.on("layout-change", () => this.reconcileFromSource()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.reconcileFromSource()));

    this.registerEditorExtension(
      Prec.highest(
        createLivePreviewExtension(
          this.app,
          () => this.app.workspace.getActiveFile()?.path ?? "",
          (img) => this.toolbarItemsForImage(img),
          () => this.settings.showCaptions,
          () => this.settings.alwaysShowLink
        )
      )
    );

    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleNormalize()));

    this.app.workspace.onLayoutReady(async () => { await this.refreshSnippets(); });

    const snippetsDir = `${this.app.vault.configDir}/snippets/`;
    const onSnippetChange = (path: string): void => {
      if (path.startsWith(snippetsDir) && path.endsWith(".css")) this.scheduleSnippetRefresh();
    };
    this.registerEvent(this.app.vault.on("modify", (f) => onSnippetChange(f.path)));
    this.registerEvent(this.app.vault.on("create", (f) => onSnippetChange(f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => onSnippetChange(f.path)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { onSnippetChange(f.path); onSnippetChange(oldPath); }));

    if (__LIE_DEV__) {
      import("./dev-bridge").then((m) => m.startDevBridge(this)).catch(() => {});
    }
  }

  onunload(): void {
    this.closeFilterPanel("cancel");
    this.closeSubmenu("cancel");
    this.closeCrop();
    this.toolbar.hide();
    this.stylesInjector.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.presetWidths = Object.assign({}, DEFAULT_SETTINGS.presetWidths, this.settings.presetWidths);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.stylesInjector.inject(this.settings.disabledInternalClasses, this.settings.presetWidths);
    this.initLocale();
    this.refreshLivePreviewDecorations();
    this.reconcileFromSource();
  }

  private refreshLivePreviewDecorations(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const cm = (view.editor as unknown as { cm?: EditorView }).cm;
      cm?.dispatch({ effects: refreshDecorations.of() });
    }
  }

  getSnippetClasses(): SnippetClass[] {
    return this.snippetClasses;
  }

  async refreshSnippets(): Promise<void> {
    // Only scan snippets ENABLED in Obsidian, not merely present in the folder (#6b).
    const enabled = (this.app as unknown as { customCss?: { enabledSnippets?: Set<string> } }).customCss?.enabledSnippets;
    this.snippetClasses = await scanSnippets(this.app.vault, enabled);
  }

  private snippetRefreshTimer = 0;
  private scheduleSnippetRefresh(): void {
    window.clearTimeout(this.snippetRefreshTimer);
    this.snippetRefreshTimer = window.setTimeout(() => void this.refreshSnippets(), 300);
  }

  private initLocale(): void {
    setLocale(detectLocale());
  }

  private postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    // The live-preview CM6 widget owns the editor (AD5 overlay); never box the native
    // (CSS-suppressed) embed images inside the editor.
    if (el.closest(".cm-editor")) return;
    const sourcePath = ctx.sourcePath || this.app.workspace.getActiveFile()?.path || "";
    for (const embed of Array.from(el.querySelectorAll(".internal-embed"))) {
      this.processBlock(embed as HTMLElement, () => embed.querySelector("img"), sourcePath);
    }
    for (const img of Array.from(el.querySelectorAll("img"))) {
      if (img.closest(".internal-embed")) continue;
      this.processBlock(img as HTMLElement, () => img as HTMLImageElement, sourcePath);
    }
  }

  private processBlock(anchor: HTMLElement, getImg: () => HTMLImageElement | null, sourcePath: string): void {
    const textNode = this.findBlockTextNode(anchor);
    const match = textNode ? (textNode.textContent ?? "").match(/^\s*\{([^}]*)\}/) : null;
    const transform = match ? parseAltText(match[1] ?? "") : null;
    const hasTransform = !!(transform && this.hasTransforms(transform));

    if (hasTransform && textNode && match) {
      textNode.textContent = (textNode.textContent ?? "").slice(match[0].length);
    }

    const apply = (): boolean => {
      const img = getImg();
      if (!img) return false;
      if (hasTransform) applyTransformToImage(img, transform as ImageTransform);
      else this.clearStaleTransform(img);
      this.applyReadingCaption(img, sourcePath);
      return true;
    };
    if (apply()) return;

    const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
    observer.observe(anchor, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    window.setTimeout(() => observer.disconnect(), 5000);
  }

  private readingCaptions = new WeakMap<HTMLImageElement, CaptionHandle>();
  private readingCaptionText = new WeakMap<HTMLImageElement, string>();

  // Reading-view caption (F22): render the alt text as a Markdown caption below the
  // box, as a child of the embed (sized to the box by pure CSS, AB7). Idempotent.
  private applyReadingCaption(img: HTMLImageElement, sourcePath: string): void {
    const want = this.settings.showCaptions ? captionFromAlt(img.alt) : "";
    const prev = this.readingCaptions.get(img);
    if (prev && want && this.readingCaptionText.get(img) === want) return;

    if (prev) {
      prev.el.remove();
      prev.destroy();
      this.readingCaptions.delete(img);
      this.readingCaptionText.delete(img);
    }

    const box = img.closest<HTMLElement>(".lie-image-area");
    const embed = (box ?? img).parentElement;
    embed?.classList.remove("lie-has-caption");
    if (!want || !embed) return;

    const caption = createCaption(this.app, want, sourcePath);
    if (!caption) return;
    embed.classList.add("lie-has-caption");
    (box ?? img).insertAdjacentElement("afterend", caption.el);
    this.readingCaptions.set(img, caption);
    this.readingCaptionText.set(img, want);
  }

  private normalizeTimer = 0;
  private scheduleNormalize(): void {
    window.clearTimeout(this.normalizeTimer);
    this.normalizeTimer = window.setTimeout(() => {
      this.normalizeNativeSizes();
      this.normalizeLinkFormat();
    }, 400);
  }

  // F5/F6 — keep image embeds in the link form Obsidian's "Use [[Wikilinks]]" setting
  // dictates, carrying the trailing {…} block across. Skips the cursor line.
  private normalizeLinkFormat(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) return;

    const useMarkdownLinks = !!(this.app.vault as unknown as { getConfig?: (k: string) => unknown })
      .getConfig?.("useMarkdownLinks");
    const desired = desiredFormat(useMarkdownLinks);
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    const cursorLine = editor.getCursor().line;

    for (let i = 0; i < editor.lineCount(); i++) {
      if (i === cursorLine) continue;
      const line = editor.getLine(i);
      const newLine = convertEmbedLine(line, desired, (p) => this.formattedPath(p, sourcePath, desired));
      if (newLine !== null && newLine !== line) editor.setLine(i, newLine);
    }
  }

  private formattedPath(path: string, sourcePath: string, desired: LinkFormat): string | null {
    try {
      const file = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(path.split("|")[0] ?? path), sourcePath);
      if (!(file instanceof TFile)) return null;
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath); // never an alias arg (T-L5)
      if (desired === "wiki") {
        const m = link.match(/^!?\[\[([^\]|]+)/);
        return m?.[1] ?? null;
      }
      const m = link.match(/\]\(([^)]+)\)/);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  }

  // Fold a Markdown native size ![alt|513](path) into the portable block (F6).
  private normalizeNativeSizes(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) return;

    const cursorLine = editor.getCursor().line;
    const re = /!\[([^\]|]*)\|(\d+)(?:x(\d+))?\]\(([^)]+)\)(\{[^}]*\})?/;

    for (let i = 0; i < editor.lineCount(); i++) {
      if (i === cursorLine) continue;
      const line = editor.getLine(i);
      const m = re.exec(line);
      if (!m) continue;

      const transform = parseAltText(m[5] ? m[5].slice(1, -1) : "");
      transform.width = `${parseInt(m[2] ?? "", 10)}px`;
      if (m[3]) transform.height = `${parseInt(m[3], 10)}px`;

      const params = serializeTransform(transform);
      const replacement = `![${m[1] ?? ""}](${m[4] ?? ""})${params ? `{${params}}` : ""}`;
      const newLine = line.slice(0, m.index) + replacement + line.slice(m.index + m[0].length);
      if (newLine !== line) editor.setLine(i, newLine);
    }
  }

  // Reading-view render path only (Obsidian caches embeds). The LP CM6 widget owns its
  // own `.lie-wrapper` images — reconcile must NOT touch them (no double render, T-L8).
  private reconcileFromSource(): void {
    const run = () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      const container = view.contentEl.querySelector(
        ".markdown-reading-view, .markdown-preview-view, .markdown-source-view"
      );
      if (!container) return;
      const source = view.editor?.getValue() ?? "";
      if (!source) return;
      const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";

      for (const el of Array.from(container.querySelectorAll("img"))) {
        const img = el as HTMLImageElement;
        // The LP overlay owns its own images; the editor's native embed images are
        // CSS-suppressed and must be left untouched (AD5 — no double render).
        if (img.closest(".lie-wrapper, .cm-editor")) continue;
        const file = getImageFilename(img);
        if (!file) continue;
        const loc = findImageInText(source, file);
        const transform = loc ? parseAltText(loc.params) : null;
        if (transform && this.hasTransforms(transform)) applyTransformToImage(img, transform);
        else this.clearStaleTransform(img);
        this.applyReadingCaption(img, sourcePath);
      }
    };
    run();
    window.requestAnimationFrame(run);
  }

  private clearStaleTransform(img: HTMLImageElement | null): void {
    if (!img) return;
    const ours = img.classList.contains("lie-img") ||
      img.classList.contains("lie-inline") ||
      (img.parentElement?.classList.contains("lie-image-area") ?? false);
    if (ours) {
      applyTransformToImage(img, { classes: [] });
      unwrapBox(img);
    }
  }

  private findBlockTextNode(anchor: Element): Text | null {
    let node: Node | null = anchor.nextSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (text.trim() === "") { node = node.nextSibling; continue; }
        return /^\s*\{[^}]*\}/.test(text) ? (node as Text) : null;
      }
      return null;
    }
    return null;
  }

  private registerImageSelectionHandler(): void {
    this.registerDomEvent(document, "click", (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;
      if (target.tagName === "IMG" && target.closest(".markdown-source-view")) {
        this.hoverShown = false; // click-shown: stays until click-outside, not hover-out
        this.onImageSelected(target as HTMLImageElement);
      } else if (
        !target.closest(".lie-toolbar") &&
        !target.closest(".lie-filter-panel") &&
        !target.closest(".lie-submenu") &&
        !target.closest(".lie-group-popup") &&
        !target.closest(".lie-crop-overlay") &&
        !target.closest(".lie-wrapper")
      ) {
        this.dismissToolbar();
      }
    });

    // HOVER path for images that can't host the in-chrome toolbar (`.lie-float`: too-short
    // block images flagged by the reflow, and inline icons). They use the SAME toolbar, shown
    // floating on the body (outside `contain: paint`). One delegated `mouseover` both opens it
    // (entering a `.lie-float` image) and dismisses it (leaving the image AND the toolbar) —
    // the floating bar sits over the image, so moving onto it stays "inside" and keeps it.
    this.registerDomEvent(document, "mouseover", (evt: MouseEvent) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(".lie-toolbar, .lie-group-popup, .lie-submenu, .lie-filter-panel, .lie-crop-overlay")) return;
      const floatWrap = target.closest<HTMLElement>(".markdown-source-view .lie-wrapper.lie-float");
      if (floatWrap) {
        const img = floatWrap.querySelector("img");
        if (img && this.settings.showToolbar && this.toolbar.getActiveImage() !== img) {
          this.onImageSelected(img);
          this.hoverShown = true;
        }
        return;
      }
      if (this.hoverShown && !this.filterPanel && !this.submenu && !this.cropEditor) {
        this.dismissToolbar();
      }
    });

    this.registerLongPress();
  }

  private registerLongPress(): void {
    let timer = 0;
    let startImg: HTMLImageElement | null = null;
    const clear = (): void => { window.clearTimeout(timer); timer = 0; startImg = null; };

    this.registerDomEvent(document, "touchstart", (evt: TouchEvent) => {
      const target = evt.target as HTMLElement;
      if (target.tagName !== "IMG") return;
      startImg = target as HTMLImageElement;
      timer = window.setTimeout(() => { if (startImg) this.onImageSelected(startImg); }, 500);
    }, { passive: true });
    this.registerDomEvent(document, "touchmove", clear, { passive: true });
    this.registerDomEvent(document, "touchend", clear, { passive: true });
    this.registerDomEvent(document, "touchcancel", clear, { passive: true });
  }

  private registerToolbarDismissHandlers(): void {
    const overlaySelector = ".modal-container, .menu, .prompt, .suggestion-container";
    const observer = new MutationObserver((mutations) => {
      if (!this.toolbar.isVisible() && !this.filterPanel && !this.submenu && !this.cropEditor) return;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement && node.matches(overlaySelector)) { this.dismissToolbar(); return; }
        }
      }
    });
    observer.observe(document.body, { childList: true });
    this.register(() => observer.disconnect());

    this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
      if (evt.key !== "Escape") return;
      if (this.filterPanel || this.submenu || this.cropEditor) return;
      this.dismissToolbar();
    });
    this.registerDomEvent(window, "blur", () => this.dismissToolbar());
  }

  private dismissToolbar(): void {
    this.closeFilterPanel("commit");
    this.closeSubmenu("commit");
    this.closeCrop();
    this.toolbar.hide();
    this.activeImage = null;
    this.hoverShown = false;
  }

  private onImageSelected(img: HTMLImageElement): void {
    if (!this.settings.showToolbar) return;
    if (img !== this.activeImage) {
      this.closeFilterPanel("commit");
      this.closeSubmenu("commit");
      this.closeCrop();
    }
    this.activeImage = img;
    // An overlay image that hosts its OWN in-chrome toolbar needs no floating one. But a
    // `.lie-float` overlay image (too short for in-chrome, or an inline icon) does — let it
    // through to the floating toolbar, same as a non-overlay image.
    if (img.closest(".lie-wrapper:not(.lie-float)")) return;
    this.toolbar.show(img, this.toolbarItemsForImage(img));
  }

  private toolbarItemsForImage(img: HTMLImageElement): ToolbarItem[] {
    const bind = (b: ToolbarButton): ToolbarButton => ({
      ...b,
      action: () => { this.activeImage = img; b.action(); },
    });
    return this.buildToolbarItems().map((it) =>
      it.kind === "button" ? bind(it) : { ...it, buttons: it.buttons.map(bind) }
    );
  }

  private buildToolbarItems(): ToolbarItem[] {
    const b = (id: string, icon: string, titleKey: ToolbarButton["titleKey"], action: () => void): ToolbarButton =>
      ({ kind: "button", id, icon, titleKey, action });

    const editGroup: ToolbarGroup = {
      kind: "group", id: "edit", icon: "pencil", titleKey: "edit", collapse: "auto",
      buttons: [
        b("rotate-cw", "rotate-cw", "rotateCw", () => this.rotateCw()),
        b("rotate-ccw", "rotate-ccw", "rotateCcw", () => this.rotateCcw()),
        b("flip-h", "flip-horizontal", "flipH", () => this.flipH()),
        b("flip-v", "flip-vertical", "flipV", () => this.flipV()),
        b("crop", "crop", "crop", () => this.crop()),
      ],
    };
    const layoutGroup: ToolbarGroup = {
      kind: "group", id: "layout", icon: "layout-list", titleKey: "layout", collapse: "auto",
      buttons: [
        b("align-left", "align-left", "alignLeft", () => this.applyAlignment("lie-left")),
        b("align-center", "align-center", "alignCenter", () => this.applyAlignment("lie-center")),
        b("align-right", "align-right", "alignRight", () => this.applyAlignment("lie-right")),
        b("inline", "gallery-horizontal-end", "inlineBlock", () => this.toggleInline()),
      ],
    };

    return [
      editGroup,
      b("filters", "sliders-horizontal", "filters", () => this.toggleFilters()),
      b("custom-size", "maximize", "customSize", () => this.customSize()),
      layoutGroup,
      b("snippets", "chevron-down", "snippets", () => this.addClass()),
      b("export", "download", "export", () => this.exportImage()),
      b("reset", "undo-2", "reset", () => this.reset()),
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
      toggleFilters: () => this.toggleFilters(),
      sizeSmall: () => this.applyPreset("small"),
      sizeMedium: () => this.applyPreset("medium"),
      sizeLarge: () => this.applyPreset("large"),
      classLeft: () => this.applyAlignment("lie-left"),
      classRight: () => this.applyAlignment("lie-right"),
      classCenter: () => this.applyAlignment("lie-center"),
      addClass: () => this.addClass(),
      reset: () => this.reset(),
      customSize: () => this.customSize(),
      toggleInline: () => this.toggleInline(),
      exportImage: () => this.exportImage(),
    };
    registerCommands(this, handler);
  }

  private resolveLocation(): { editor: Editor; location: ImageLocation } | null {
    if (!this.activeImage) return null;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Live Image Editor: open the note in editing mode to edit images.");
      return null;
    }
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) {
      new Notice("Live Image Editor: couldn't locate this image in the note source.");
      return null;
    }
    return { editor, location };
  }

  private modifyTransform(modifier: (t: ImageTransform) => void): void {
    const resolved = this.resolveLocation();
    if (!resolved) return;
    const { editor, location } = resolved;
    const transform = parseAltText(location.params);
    modifier(transform);
    this.writeTransform(editor, location, transform);
    this.applyLivePreview(location, transform);
  }

  private applyLivePreview(location: ImageLocation, transform: ImageTransform): void {
    const apply = () => {
      const img = this.activeImage?.isConnected ? this.activeImage : this.findRenderedImage(location);
      if (!img) return;
      this.activeImage = img;
      applyTransformToImage(img, transform);
    };
    apply();
    window.requestAnimationFrame(apply);
  }

  private findRenderedImage(location: ImageLocation): HTMLImageElement | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const root = view?.contentEl.querySelector(".markdown-source-view, .markdown-reading-view");
    if (!root) return null;
    const base = location.filename.split(/[/\\]/).pop() ?? "";
    if (!base) return null;
    return (Array.from(root.querySelectorAll("img")).find((img) => {
      const src = decodeURIComponent(img.getAttribute("src") ?? "");
      return src.includes(base);
    }) as HTMLImageElement | undefined) ?? null;
  }

  private writeTransform(editor: Editor, location: ImageLocation, transform: ImageTransform): void {
    const params = serializeTransform(transform);
    const block = params ? `{${params}}` : "";
    const scroll = editor.getScrollInfo();
    editor.replaceRange(
      block,
      { line: location.line, ch: location.headEnd },
      { line: location.line, ch: location.end }
    );
    this.restoreScroll(editor, scroll);
  }

  private restoreScroll(editor: Editor, scroll: { top: number; left: number }): void {
    const restore = () => editor.scrollTo(scroll.left, scroll.top);
    restore();
    window.requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
  }

  private rotateCw(): void {
    this.modifyTransform((tr) => setRotation(tr, (getRotation(tr) + 90) % 360));
  }
  private rotateCcw(): void {
    this.modifyTransform((tr) => setRotation(tr, (getRotation(tr) - 90 + 360) % 360));
  }
  private flipH(): void { this.modifyTransform((tr) => toggleFlipH(tr)); }
  private flipV(): void { this.modifyTransform((tr) => toggleFlipV(tr)); }

  private applyAlignment(cls: string): void {
    const aligns = ["lie-left", "lie-center", "lie-right"];
    this.modifyTransform((tr) => {
      const had = tr.classes.includes(cls);
      tr.classes = tr.classes.filter((c) => !aligns.includes(c));
      if (!had) tr.classes.push(cls);
    });
  }

  private toggleInline(): void {
    this.modifyTransform((tr) => { tr.inline = !tr.inline; });
  }

  private applyPreset(key: PresetKey): void {
    this.modifyTransform((tr) => setPresetWidth(tr, key));
  }

  private applyClass(cls: string): void {
    this.modifyTransform((tr) => {
      const idx = tr.classes.indexOf(cls);
      if (idx >= 0) tr.classes.splice(idx, 1);
      else tr.classes.push(cls);
    });
  }

  private reset(): void {
    const resolved = this.resolveLocation();
    if (!resolved) return;
    const { editor, location } = resolved;
    const empty: ImageTransform = { classes: [] };
    this.writeTransform(editor, location, empty);
    applyTransformToImage(this.activeImage!, empty);
  }

  private activeToolbarEl(): HTMLElement | null {
    if (this.toolbar.isVisible()) return document.querySelector<HTMLElement>(".lie-toolbar-floating");
    return this.activeImage?.closest(".lie-wrapper")?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null;
  }

  private closeSubmenu(action: "commit" | "cancel"): void {
    this.submenu?.close(action);
  }

  private customSize(): void {
    if (this.submenu) { this.closeSubmenu("commit"); return; }
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const location = findImageInSource(view.editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.params);
    const img = this.activeImage;
    const state: SizeState = { width: current.width ?? null, height: current.height ?? null };

    // Live preview by RE-RENDERING with the new size (so clearing a field / "Original"
    // falls back to the intrinsic default rather than collapsing the box — Bug 20).
    const preview = (s: SizeState): void => {
      const tr = parseAltText(location.params);
      tr.width = s.width ?? undefined;
      tr.height = s.height ?? undefined;
      applyTransformToImage(this.liveTarget(img), tr);
    };
    const sizeBody = buildSizeBody({ width: current.width, height: current.height }, preview, state);

    const submenu = new AnchoredSubmenu();
    submenu.open({
      body: sizeBody.body,
      placement: "under-toolbar",
      anchor: this.activeToolbarEl() ?? img,
      toolbar: this.activeToolbarEl(),
      title: t("customSize"),
      hoverRegion: img.closest<HTMLElement>(".lie-wrapper") ?? undefined,
      onReset: () => sizeBody.reset(),
      onCommit: () => this.modifyTransform((tr) => { tr.width = state.width ?? undefined; tr.height = state.height ?? undefined; }),
      onCancel: () => applyTransformToImage(this.liveTarget(img), parseAltText(location.params)),
      onClose: () => { this.submenu = null; },
    });
    this.submenu = submenu;
  }

  private crop(): void {
    if (this.cropEditor) { this.cropEditor.close(); this.cropEditor = null; return; }
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const location = findImageInSource(view.editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.params);
    const cropEditor = new CropEditor(
      this.activeImage,
      current,
      (result) => {
        this.cropEditor = null;
        this.modifyTransform((tr) => {
          tr.transform = result.transform;
          tr.width = result.width;
          tr.height = result.height;
          tr.aspectRatio = undefined;
        });
      },
      () => { this.cropEditor = null; }
    );
    cropEditor.open(this.activeToolbarEl());
    this.cropEditor = cropEditor;
  }

  private closeCrop(): void {
    this.cropEditor?.close();
    this.cropEditor = null;
  }

  private toggleFilters(): void {
    if (this.filterPanel) { this.closeFilterPanel("commit"); return; }
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const location = findImageInSource(view.editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.params);
    const originalFilter = getFilter(current);
    const img = this.activeImage;

    const panel = new FilterPanel(img, originalFilter, {
      onPreview: (filter: FilterData) => applyFilterPreview(this.liveTarget(img), filter),
      onCommit: (filter: FilterData) => this.modifyTransform((tr) => setFilter(tr, Object.keys(filter).length ? filter : undefined)),
      onCancel: () => applyFilterPreview(this.liveTarget(img), originalFilter),
      onClose: () => { this.filterPanel = null; },
    });
    panel.open(img, this.activeToolbarEl());
    this.filterPanel = panel;
  }

  // The live image the preview should paint: the still-connected one, or re-acquired.
  private liveTarget(opened: HTMLImageElement): HTMLImageElement {
    if (opened.isConnected) return opened;
    if (this.activeImage?.isConnected) return this.activeImage;
    return opened;
  }

  private closeFilterPanel(action: "commit" | "cancel"): void {
    this.filterPanel?.close(action);
  }

  private addClass(): void {
    if (!this.activeImage) return;
    const availableClasses = this.snippetClasses
      .filter((sc) => !this.settings.disabledSnippetClasses.includes(sc.className));
    if (availableClasses.length === 0) {
      new Notice(t("settingsNoSnippets"));
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const location = findImageInSource(view.editor, this.activeImage);
    if (!location) return;
    const current = parseAltText(location.params);

    const menu = document.createElement("div");
    menu.classList.add("lie-class-dropdown");
    for (const sc of availableClasses) {
      const item = document.createElement("button");
      item.classList.add("lie-class-dropdown-item");
      if (current.classes.includes(sc.className)) item.classList.add("is-active");
      item.textContent = sc.className;
      item.addEventListener("click", () => { this.applyClass(sc.className); menu.remove(); });
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
    const location = findImageInSource(view.editor, this.activeImage);
    if (!location) return;

    const transform = parseAltText(location.params);
    try {
      const buffer = await renderTransformedImage(this.activeImage, transform);
      const rawLink = location.filename.split("|")[0] ?? location.filename;
      let linkpath = rawLink;
      try { linkpath = decodeURIComponent(rawLink); } catch { /* keep the raw link */ }
      const file = this.app.metadataCache.getFirstLinkpathDest(
        linkpath, this.app.workspace.getActiveFile()?.path ?? ""
      );
      const originalPath = file?.path ?? location.filename;
      const suggested = await suggestExportPath(this.app.vault, originalPath);
      const saved = await saveExport(this.app, this.app.vault, buffer, suggested, originalPath);
      if (saved) new Notice(`Exported to ${saved}`);
    } catch (e) {
      new Notice(`Export failed: ${e}`);
    }
  }

  private hasTransforms(t: ImageTransform): boolean {
    return !!(t.transform || t.filter || t.width || t.height || t.aspectRatio ||
      (t.box && Object.keys(t.box).length) || t.classes.length || t.inline);
  }
}
