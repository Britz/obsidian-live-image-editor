import { Plugin, MarkdownView, MarkdownPostProcessorContext, Notice, Editor } from "obsidian";
import { ImageTransform, FilterData, parseAltText, serializeTransform } from "./transforms";
import { applyTransformToImage, applyFilterVars, unwrapBox } from "./renderer";
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
import { TFile } from "obsidian";

export default class LiveImageEditorPlugin extends Plugin {
  settings: LieSettings = DEFAULT_SETTINGS;
  private toolbar = new ImageToolbar();
  private stylesInjector = new StylesInjector();
  private snippetClasses: SnippetClass[] = [];
  private activeImage: HTMLImageElement | null = null;
  private filterPanel: FilterPanel | null = null;
  // The shared anchored sub-menu (D8/D10/T9) — reused by custom-size and crop.
  private submenu: AnchoredSubmenu | null = null;
  private cropEditor: CropEditor | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initLocale();
    this.stylesInjector.inject(this.settings.disabledInternalClasses);

    this.addSettingTab(new LieSettingTab(this.app, this));
    this.registerMarkdownPostProcessor(this.postProcessor.bind(this));
    this.registerImageSelectionHandler();
    this.registerToolbarDismissHandlers();
    this.registerCommands();

    // Obsidian reuses cached embed DOM, so switching edit→reading can show a
    // stale transform. Reconcile every rendered image against the source on
    // layout/leaf changes — the source is the truth, not the cached DOM.
    this.registerEvent(this.app.workspace.on("layout-change", () => this.reconcileFromSource()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.reconcileFromSource()));

    // Live preview: a StateField block-widget renders each ![…](…){…} line as one
    // unit (embed + transform + the editing toolbar in its chrome). Prec.highest
    // to override Obsidian's embed widget.
    this.registerEditorExtension(
      Prec.highest(
        createLivePreviewExtension(
          this.app,
          () => this.app.workspace.getActiveFile()?.path ?? "",
          (img) => this.toolbarItemsForImage(img),
          () => this.settings.showCaptions
        )
      )
    );

    // Obsidian's native resize writes a non-portable size into the markdown alt
    // (![alt|513](path)). Fold it into the portable {…} block to stay consistent.
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleNormalize()));

    this.app.workspace.onLayoutReady(async () => {
      await this.refreshSnippets();
    });

    // Snippet classes update on load AND on file change (F10/T6): re-scan whenever
    // a .css file under the vault's snippets dir is created/modified/deleted/renamed.
    const snippetsDir = `${this.app.vault.configDir}/snippets/`;
    const onSnippetChange = (path: string): void => {
      if (path.startsWith(snippetsDir) && path.endsWith(".css")) this.scheduleSnippetRefresh();
    };
    this.registerEvent(this.app.vault.on("modify", (f) => onSnippetChange(f.path)));
    this.registerEvent(this.app.vault.on("create", (f) => onSnippetChange(f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => onSnippetChange(f.path)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
      onSnippetChange(f.path);
      onSnippetChange(oldPath);
    }));

    // Dev builds only: expose Obsidian's CDP port to the devcontainer so other
    // sessions can attach. Tree-shaken out of production (see src/dev-bridge.ts).
    if (__LIE_DEV__) {
      import("./dev-bridge").then((m) => m.startDevBridge(this)).catch(() => {});
    }
  }

  onunload(): void {
    // Cancel (don't write to the doc during teardown), then tear down chrome.
    this.closeFilterPanel("cancel");
    this.closeSubmenu("cancel");
    this.closeCrop();
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
    // Captions toggle live: force every live-preview editor to rebuild its widgets,
    // and re-run the reading-view render so captions appear/disappear immediately.
    this.refreshLivePreviewDecorations();
    this.reconcileFromSource();
  }

  // Tell every open live-preview editor to rebuild its decorations (e.g. after the
  // show-captions setting changed — nothing in the document changed, so only an
  // explicit effect triggers a rebuild).
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
    this.snippetClasses = await scanSnippets(this.app.vault, "");
  }

  private snippetRefreshTimer = 0;

  // Debounced — a snippet save can fire several vault events in quick succession.
  private scheduleSnippetRefresh(): void {
    window.clearTimeout(this.snippetRefreshTimer);
    this.snippetRefreshTimer = window.setTimeout(() => void this.refreshSnippets(), 300);
  }

  private initLocale(): void {
    setLocale(detectLocale());
  }

  private postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const sourcePath = ctx.sourcePath || this.app.workspace.getActiveFile()?.path || "";
    // Internal embeds: the <span class="internal-embed"> exists at post-process
    // time, but Obsidian injects the <img> asynchronously — so we anchor on the
    // embed (+ its trailing {…} text node) and apply once the image appears.
    for (const embed of Array.from(el.querySelectorAll(".internal-embed"))) {
      this.processBlock(embed as HTMLElement, () => embed.querySelector("img"), sourcePath);
    }
    // External markdown images render as a plain <img> straight away.
    for (const img of Array.from(el.querySelectorAll("img"))) {
      if (img.closest(".internal-embed")) continue;
      this.processBlock(img as HTMLElement, () => img as HTMLImageElement, sourcePath);
    }
  }

  // Transforms live in a trailing {…} block, which Obsidian renders as a plain
  // text node right after the embed. Parse it, strip the text so it isn't shown,
  // and apply the transform to the (possibly async-loaded) image. A caption (the
  // alt text) is applied independently of any transform — a plain `![cap](img)`
  // with no {…} block still gets a caption when the setting is on.
  private processBlock(anchor: HTMLElement, getImg: () => HTMLImageElement | null, sourcePath: string): void {
    const textNode = this.findBlockTextNode(anchor);
    const match = textNode ? (textNode.textContent ?? "").match(/^\s*\{([^}]*)\}/) : null;
    const transform = match ? parseAltText(match[1] ?? "") : null;
    const hasTransform = !!(transform && this.hasTransforms(transform));

    // Strip the {…} text only when it's a real transform block (so it isn't shown).
    if (hasTransform && textNode && match) {
      textNode.textContent = (textNode.textContent ?? "").slice(match[0].length);
    }

    const apply = (): boolean => {
      const img = getImg();
      if (!img) return false;
      // No (more) transform — Obsidian reuses cached embed DOM, so an image that was
      // un-rotated would otherwise keep its old transform/wrapper. Reset it.
      if (hasTransform) applyTransformToImage(img, transform as ImageTransform);
      else this.clearStaleTransform(img);
      this.applyReadingCaption(img, sourcePath);
      return true;
    };
    if (apply()) return;

    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(anchor, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    window.setTimeout(() => observer.disconnect(), 5000);
  }

  // Per-image caption handles in reading view, so a re-render (or a settings toggle)
  // can tear the old one down before building the new one (no leaks, no duplicates).
  private readingCaptions = new WeakMap<HTMLImageElement, CaptionHandle>();
  // The caption text last rendered for each image, so an unchanged caption is left in
  // place instead of being torn down and re-rendered on every reconcile.
  private readingCaptionText = new WeakMap<HTMLImageElement, string>();

  // Reading-view caption (F3 parity with live preview): render the image's alt text
  // as a Markdown caption below it. Idempotent and cheap to re-call — a caption whose
  // text is unchanged is left untouched, so the double reconcile pass (sync + rAF)
  // and frequent reconciles don't flicker or re-render Markdown needlessly.
  private applyReadingCaption(img: HTMLImageElement, sourcePath: string): void {
    const want = this.settings.showCaptions ? captionFromAlt(img.alt) : "";
    const prev = this.readingCaptions.get(img);

    // Same non-empty caption as last time → keep it (the host class is already set).
    if (prev && want && this.readingCaptionText.get(img) === want) return;

    if (prev) {
      prev.el.remove();
      prev.destroy();
      this.readingCaptions.delete(img);
      this.readingCaptionText.delete(img);
    }

    const box = img.closest<HTMLElement>(".lie-rotate-box");
    const host = (box ?? img).parentElement;
    host?.classList.remove("lie-has-caption");
    if (!want || !host) return;

    const caption = createCaption(this.app, want, sourcePath, img);
    if (!caption) return;
    host.classList.add("lie-has-caption");
    (box ?? img).insertAdjacentElement("afterend", caption.el);
    this.readingCaptions.set(img, caption);
    this.readingCaptionText.set(img, want);
  }

  private reconcileTimer = 0;
  private normalizeTimer = 0;

  // Debounced reconcile — live preview fires many editor updates per second.
  private scheduleReconcile(): void {
    window.clearTimeout(this.reconcileTimer);
    this.reconcileTimer = window.setTimeout(() => this.reconcileFromSource(), 50);
  }

  private scheduleNormalize(): void {
    window.clearTimeout(this.normalizeTimer);
    this.normalizeTimer = window.setTimeout(() => {
      this.normalizeNativeSizes();
      this.normalizeLinkFormat();
    }, 400);
  }

  // F4/T12 — keep image embeds in the link form Obsidian's central "Use
  // [[Wikilinks]]" setting dictates, converting between ![](…) and ![[…]] while
  // preserving the trailing {…} block, caption and native |size. Skips the cursor
  // line so active typing isn't disrupted; converted lines no longer differ, so no
  // loop. Defensive: the path token comes from fileManager.generateMarkdownLink,
  // falling back to the existing path if anything is off (never breaks a link).
  private normalizeLinkFormat(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) return;

    const useMarkdownLinks = !!(this.app.vault as unknown as {
      getConfig?: (k: string) => unknown;
    }).getConfig?.("useMarkdownLinks");
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

  // Obtain the correctly-formatted/encoded path token for `desired` via Obsidian's
  // own link generator, defensively (T12): resolve the file, ask
  // generateMarkdownLink, and extract just the path. Returns null on any failure
  // so the caller keeps the original path.
  private formattedPath(path: string, sourcePath: string, desired: LinkFormat): string | null {
    try {
      const file = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(path.split("|")[0] ?? path), sourcePath);
      if (!(file instanceof TFile)) return null;
      // Never pass an alias arg (T-L5) — that would push size/caption into alt.
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath);
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

  // Rewrite ![alt|513](path) → ![alt](path){… width:513px} so a native Obsidian
  // resize ends up in the portable block. Skips the cursor's line to avoid
  // disrupting active editing; rewritten lines no longer match, so no loop.
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
      transform.width = parseInt(m[2] ?? "", 10);
      if (m[3]) transform.height = parseInt(m[3], 10);

      const params = serializeTransform(transform);
      const replacement = `![${m[1] ?? ""}](${m[4] ?? ""})${params ? `{${params}}` : ""}`;
      const newLine = line.slice(0, m.index) + replacement + line.slice(m.index + m[0].length);
      if (newLine !== line) editor.setLine(i, newLine);
    }
  }

  // Apply every visible image's transform straight from the note source. This is
  // the render path for READING VIEW only (Obsidian caches embeds, so a stale
  // transform can survive a mode switch). In live preview the CM6 widget is the
  // single render path and OWNS its images — reconcile must NOT touch them, or the
  // image would be rendered twice (widget + reconcile), re-measuring the rotate box
  // with a possibly different available width and producing inconsistent sizes.
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
        // The live-preview widgets (block embed + inline image) render their own
        // images — single render path, no double-render (requirement / T-L8).
        if (img.closest(".lie-lp-embed, .lie-lp-inline")) continue;
        const file = getImageFilename(img);
        if (!file) continue;
        const loc = findImageInText(source, file);
        const transform = loc ? parseAltText(loc.params) : null;
        if (transform && this.hasTransforms(transform)) {
          applyTransformToImage(img, transform);
        } else {
          this.clearStaleTransform(img);
        }
        this.applyReadingCaption(img, sourcePath);
      }
    };
    run();
    window.requestAnimationFrame(run);
  }

  // Undo a transform we applied earlier (e.g. on a cached embed) when the source
  // no longer has a {…} block.
  private clearStaleTransform(img: HTMLImageElement | null): void {
    if (!img) return;
    // Only reset state WE applied (marker class / our wrapper). Never touch a raw
    // width/transform that may have come from Obsidian's native resize handle.
    const ours =
      img.classList.contains("lie-img") ||
      img.classList.contains("lie-inline") ||
      (img.parentElement?.classList.contains("lie-rotate-box") ?? false);
    if (ours) {
      applyTransformToImage(img, { classes: [] });
      // This image is no longer ours — drop the wrapper so it's a plain native
      // embed again (the always-present box is only for images we render).
      unwrapBox(img);
    }
  }

  private findBlockTextNode(anchor: Element): Text | null {
    let node: Node | null = anchor.nextSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (text.trim() === "") {
          node = node.nextSibling;
          continue;
        }
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
        this.onImageSelected(target as HTMLImageElement);
      } else if (
        // Image + toolbar + open filter panel / sub-menu are one continuous active
        // region (D7): clicking the panel/menu (or the in-image chrome) must not
        // dismiss either.
        !target.closest(".lie-toolbar") &&
        !target.closest(".lie-filter-panel") &&
        !target.closest(".lie-submenu") &&
        !target.closest(".lie-group-popup") &&
        !target.closest(".lie-lp-embed")
      ) {
        this.dismissToolbar();
      }
    });

    this.registerLongPress();
  }

  // Mobile: a long-press substitutes for hover to reveal the toolbar (D14). On
  // touch devices there is no hover, and a tap just places the cursor — so hold to
  // select the image.
  private registerLongPress(): void {
    let timer = 0;
    let startImg: HTMLImageElement | null = null;
    const clear = (): void => { window.clearTimeout(timer); timer = 0; startImg = null; };

    this.registerDomEvent(document, "touchstart", (evt: TouchEvent) => {
      const target = evt.target as HTMLElement;
      if (target.tagName !== "IMG") return;
      startImg = target as HTMLImageElement;
      timer = window.setTimeout(() => {
        if (startImg) this.onImageSelected(startImg);
      }, 500);
    }, { passive: true });

    this.registerDomEvent(document, "touchmove", clear, { passive: true });
    this.registerDomEvent(document, "touchend", clear, { passive: true });
    this.registerDomEvent(document, "touchcancel", clear, { passive: true });
  }

  // The click handler above only fires on actual clicks. When another UI context
  // takes over without a click — a modal, menu or prompt opened via a keyboard
  // shortcut (e.g. the settings window) — the toolbar would otherwise keep
  // floating on top of it. Watch for those overlays and dismiss the toolbar.
  private registerToolbarDismissHandlers(): void {
    const overlaySelector = ".modal-container, .menu, .prompt, .suggestion-container";

    const observer = new MutationObserver((mutations) => {
      // The filter panel can be open over a live-preview image without the floating
      // toolbar being shown (its chrome lives in the widget) — so dismiss when
      // either is active (B2), not just when the floating toolbar is visible.
      if (!this.toolbar.isVisible() && !this.filterPanel && !this.submenu && !this.cropEditor) return;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement && node.matches(overlaySelector)) {
            this.dismissToolbar();
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
    this.register(() => observer.disconnect());

    this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
      if (evt.key !== "Escape") return;
      // An open panel / sub-menu owns Escape (closes as cancel); don't also dismiss
      // here, or it would commit before it can revert.
      if (this.filterPanel || this.submenu || this.cropEditor) return;
      this.dismissToolbar();
    });
    this.registerDomEvent(window, "blur", () => this.dismissToolbar());
  }

  private dismissToolbar(): void {
    // Close any open panel/sub-menu first (they commit while activeImage is still
    // resolvable), then drop the toolbar and selection.
    this.closeFilterPanel("commit");
    this.closeSubmenu("commit");
    this.closeCrop();
    this.toolbar.hide();
    this.activeImage = null;
  }

  private onImageSelected(img: HTMLImageElement): void {
    if (!this.settings.showToolbar) return;

    // Selecting a different image commits and closes any open panel/sub-menu — do
    // it while activeImage still points at the old image so the commit resolves.
    if (img !== this.activeImage) {
      this.closeFilterPanel("commit");
      this.closeSubmenu("commit");
      this.closeCrop();
    }

    this.activeImage = img;
    // Images inside our live-preview widget already carry the toolbar in their
    // chrome; only float one for plain images (e.g. those without a {…} block).
    if (img.closest(".lie-lp-embed")) return;
    this.toolbar.show(img, this.toolbarItemsForImage(img));
  }

  // Toolbar items bound to a specific image — used by the live-preview widget and
  // the floating toolbar, where clicking a button must target that image. Binds
  // every button (including nested group buttons).
  private toolbarItemsForImage(img: HTMLImageElement): ToolbarItem[] {
    const bind = (b: ToolbarButton): ToolbarButton => ({
      ...b,
      action: () => { this.activeImage = img; b.action(); },
    });
    return this.buildToolbarItems().map((it) =>
      it.kind === "button" ? bind(it) : { ...it, buttons: it.buttons.map(bind) }
    );
  }

  // The grouped toolbar model (D2 order, D3 groups). Edit (rotate/flip/crop) folds
  // into a submenu when space is tight; Layout (align/inline) is always a submenu
  // (the layout-list trigger). `<>` (reveal) is appended by the live-preview widget.
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
      kind: "group", id: "layout", icon: "layout-list", titleKey: "layout", collapse: "always",
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

  // In live preview, editing the source makes Obsidian re-render the embed and
  // swap the <img>, so this.activeImage becomes detached (and would measure as a
  // few px). Re-acquire the current image — now and next frame, since the swap
  // can be async — and apply to it.
  private applyLivePreview(location: ImageLocation, transform: ImageTransform): void {
    const apply = () => {
      const img = this.activeImage?.isConnected
        ? this.activeImage
        : this.findRenderedImage(location);
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

  // Append/replace only the trailing {…} block. The link itself (type, alt text,
  // path, native size) is left exactly as written — no wiki/markdown conversion.
  private writeTransform(editor: Editor, location: ImageLocation, transform: ImageTransform): void {
    const params = serializeTransform(transform);
    const block = params ? `{${params}}` : "";

    // Don't move the cursor onto the image line — that would reveal the raw link
    // (the cursor line shows source) on every toolbar edit. Just preserve the
    // scroll position so the page doesn't jump on re-render.
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

  // Alignment is mutually exclusive: setting one clears the others; clicking the
  // active one again removes it.
  private applyAlignment(cls: string): void {
    const aligns = ["lie-left", "lie-center", "lie-right"];
    this.modifyTransform((t) => {
      const had = t.classes.includes(cls);
      t.classes = t.classes.filter((c) => !aligns.includes(c));
      if (!had) t.classes.push(cls);
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
    const resolved = this.resolveLocation();
    if (!resolved) return;
    const { editor, location } = resolved;
    const empty: ImageTransform = { classes: [] };
    this.writeTransform(editor, location, empty);
    applyTransformToImage(this.activeImage!, empty);
  }

  // The toolbar element currently controlling the active image — the floating one,
  // or the in-image one inside the live-preview widget. Used to anchor sub-menus
  // under and to grey them out while a sub-menu is open (D8).
  private activeToolbarEl(): HTMLElement | null {
    if (this.toolbar.isVisible()) {
      return document.querySelector<HTMLElement>(".lie-toolbar-floating");
    }
    return this.activeImage?.closest(".lie-lp-embed")?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null;
  }

  private closeSubmenu(action: "commit" | "cancel"): void {
    this.submenu?.close(action); // onClose nulls this.submenu
  }

  // Custom size as the shared anchored sub-menu (D8/D10/T9): compact, under the
  // toolbar, greyed toolbar, icon confirm/cancel, Esc = cancel. Toggles like the
  // filter panel — a second click on the trigger closes it.
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

    const presets = this.sizePresets(img);
    const sizeBody = buildSizeBody(
      { width: current.width, height: current.height },
      presets,
      (s) => this.previewSize(img, s.width, s.height), // live preview, no doc round-trip
      state
    );

    const submenu = new AnchoredSubmenu();
    submenu.open({
      body: sizeBody.body,
      placement: "under-toolbar",
      anchor: this.activeToolbarEl() ?? img,
      toolbar: this.activeToolbarEl(),
      title: t("customSize"),
      onReset: () => sizeBody.reset(), // resets only the size, panel stays open
      onCommit: () => {
        this.modifyTransform((tr) => {
          tr.width = state.width ?? undefined;
          tr.height = state.height ?? undefined;
        });
      },
      onCancel: () => {
        // Revert the live preview to whatever the source still holds.
        const liveTransform = parseAltText(location.params);
        applyTransformToImage(this.liveFilterTarget(img), liveTransform);
      },
      onClose: () => { this.submenu = null; },
    });
    this.submenu = submenu;
  }

  // Quick-choice widths derived from the image's natural width (falling back to
  // sensible pixel sizes) so Small/Medium/Large scale to the picture.
  private sizePresets(img: HTMLImageElement): { small: number; medium: number; large: number } {
    const nat = img.naturalWidth || 800;
    return {
      small: Math.max(80, Math.round(nat * 0.33)),
      medium: Math.max(160, Math.round(nat * 0.6)),
      large: Math.max(240, Math.round(nat)),
    };
  }

  // Live width/height preview without a document round-trip (mirrors the filter
  // preview). The wrapper box owns the size ONLY in its rotated/cropped variants;
  // for a normal image the box is display:contents (no box model), so size must go
  // on the <img> itself or the preview would have no effect.
  private previewSize(img: HTMLImageElement, width: number | null, height: number | null): void {
    const box = img.closest<HTMLElement>(".lie-box-rotate, .lie-box-crop");
    const target = box ?? img;
    target.style.width = width && width > 0 ? `${width}px` : "";
    target.style.height = height && height > 0 ? `${height}px` : "";
  }

  private crop(): void {
    if (this.cropEditor) { this.cropEditor.close(); this.cropEditor = null; return; }
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.params);

    const cropEditor = new CropEditor(
      this.activeImage,
      current.crop,
      (cropData) => {
        this.cropEditor = null;
        this.modifyTransform((t) => { t.crop = cropData; });
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

  // Toggle the filter panel like the <> reveal: a click opens it, another click
  // closes it (keeping the change). While open it's a live preview — sliders set
  // the image's filter vars straight away (B1) and only commit to the document on
  // confirm/close; cancel/Esc reverts. The panel forms one active region with the
  // image+toolbar and is dismissed on context loss (B2, via closeFilterPanel).
  private toggleFilters(): void {
    if (this.filterPanel) {
      this.closeFilterPanel("commit");
      return;
    }
    if (!this.activeImage) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const location = findImageInSource(editor, this.activeImage);
    if (!location) return;

    const current = parseAltText(location.params);
    const originalFilter = current.filter;
    const img = this.activeImage;

    const panel = new FilterPanel(img, originalFilter, {
      onPreview: (filter: FilterData) => {
        applyFilterVars(this.liveFilterTarget(img), filter);
      },
      onCommit: (filter: FilterData) => {
        this.modifyTransform((t) => {
          t.filter = Object.keys(filter).length ? filter : undefined;
        });
      },
      onCancel: () => {
        applyFilterVars(this.liveFilterTarget(img), originalFilter);
      },
      onClose: () => {
        this.filterPanel = null;
      },
    });
    panel.open(img, this.activeToolbarEl());
    this.filterPanel = panel;
  }

  // The image the live filter preview should paint. Prefer the still-connected
  // image the panel opened on; if Obsidian swapped it out, re-acquire from source.
  private liveFilterTarget(opened: HTMLImageElement): HTMLImageElement {
    if (opened.isConnected) return opened;
    if (this.activeImage?.isConnected) return this.activeImage;
    return opened;
  }

  // Close the filter panel (if any) with a commit or cancel. Closing commits/reverts
  // BEFORE the caller clears activeImage, so a commit can still resolve the source.
  private closeFilterPanel(action: "commit" | "cancel"): void {
    this.filterPanel?.close(action); // onClose nulls this.filterPanel
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
    const current = parseAltText(location.params);

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

    const transform = parseAltText(location.params);

    try {
      const buffer = await renderTransformedImage(this.activeImage, transform);
      // Resolve the original file's canonical vault path (for the default folder +
      // name suggestion), falling back to the path as written in the embed. decode
      // defensively — a literal '%' in the name is not a valid escape and would throw.
      const rawLink = location.filename.split("|")[0] ?? location.filename;
      let linkpath = rawLink;
      try { linkpath = decodeURIComponent(rawLink); } catch { /* keep the raw link */ }
      const file = this.app.metadataCache.getFirstLinkpathDest(
        linkpath,
        this.app.workspace.getActiveFile()?.path ?? ""
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
    return !!(t.width || t.height || t.rotate || t.flipH || t.flipV ||
      t.crop || t.filter || t.classes.length || t.inline);
  }
}
