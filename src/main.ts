import { Plugin, MarkdownView, MarkdownRenderChild, MarkdownPostProcessorContext, Notice, Editor, TFile, addIcon } from "obsidian";
import {
  ImageTransform, Layout, FilterData, parseAltText, serializeTransform,
  getRotation, setRotation, toggleFlipH, toggleFlipV, getFilter, setFilter,
  setWidthPx, applyNativeSize, PresetKey,
} from "./transforms";
import { buildLayers as applyTransformToImage, applyFilterPreview, BOX_CLASS } from "./render-core";
import {
  buildToolbarElement, editorToolbarOwner, ImageToolbar, TOOLBAR_ABOVE_CLASS, TOOLBAR_PRESENTATION_CHANGE_EVENT,
  TOOLBAR_SESSION_CLASS, reflowToolbar, ToolbarItem, ToolbarButton, ToolbarGroup,
} from "./toolbar";
import { BRAND_ICON_ID, BRAND_ICON_SVG } from "./brand-icon";
import { LAYOUTS, LAYOUT_ICON_ID, registerLayoutIcons, currentLayout } from "./layout-icons";
import {
  firstEmbedInLine, allEmbedsInText, spansOverlappingRanges, getImageFilename, basename,
  isImageEmbedNodeName, locationsInLineRange, currentDocumentLocationPairs,
  pairImageLocations, ImageLocation,
} from "./image-resolver";
import { CropEditor } from "./crop-editor";
import { FilterPanel } from "./filter-panel";
import { ClassPanel } from "./class-panel";
import { AnchoredSubmenu } from "./anchored-submenu";
import { bindRegionHover } from "./region-hover";
import { buildSizeBody, SizeState } from "./size-submenu";
import { renderTransformedImage, suggestExportPath, saveExport } from "./export";
import { scanSnippets, SnippetClass } from "./snippet-scanner";
import { StylesInjector } from "./styles-injector";
import { registerCommands, CommandHandler } from "./commands";
import { LieSettings, DEFAULT_SETTINGS, LieSettingTab } from "./settings";
import { createLivePreviewExtension, refreshDecorations, toggleEmbedReveal } from "./live-preview";
import { captionFromAlt, createCaption, CaptionHandle } from "./caption";
import { Prec, type Text as CmText } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { BlockType, EditorView, ViewPlugin } from "@codemirror/view";
import { setLocale, detectLocale, t } from "./i18n";
import {
  desiredFormat, splitTail, buildEmbed, stripLinkSubpath, pathFromGeneratedLink, canonicalTarget,
  scanAttributeBlock, scanEmbed, isTableRow, LinkFormat, ParsedEmbed,
} from "./link-format";
import { replaceEmbedTarget, planReplaceAll } from "./replace-logic";
import { ImagePickerModal } from "./replace-picker";
import { writeSource } from "./source-writer";
import { clickDismissesToolbar, isEngaged } from "./toolbar-region-logic";
import { ensureEditingToolbarButtons } from "./editing-toolbar-integration";

const POSTPROCESSOR_BLOCK_SELECTOR = ".cm-embed-block.markdown-rendered, .cm-embed-block.cm-callout";
const POSTPROCESSOR_TOOLBAR_CLASS = "lie-toolbar-postprocessor";

// Shared transform modifiers — used by BOTH the single-image toolbar/command path and the
// multi-image (selection) command path, so the two never drift (R0). Rotate/flip/inline are
// RELATIVE (each image steps from its own current value); `clearTransform` empties everything
// (the reset modifier, drives both the single reset and the page-/selection-scope reset).
const ROTATE_CW = (t: ImageTransform): void => setRotation(t, (getRotation(t) + 90) % 360);
const ROTATE_CCW = (t: ImageTransform): void => setRotation(t, (getRotation(t) - 90 + 360) % 360);
// Set the flat layout state; clicking the already-active state clears it (radio + toggle-off → the
// natural default). Used by the single-image toolbar buttons (multi SETS, see commandLayout).
const setLayoutToggle = (layout: Layout) => (t: ImageTransform): void => {
  t.layout = t.layout === layout ? undefined : layout;
};
const clearTransform = (t: ImageTransform): void => {
  t.classes = [];
  t.layout = t.rotate = t.flipH = t.flipV = undefined;
  t.transform = t.filter = t.width = t.height = t.aspectRatio = t.box = undefined;
};

export default class LiveImageEditorPlugin extends Plugin {
  settings: LieSettings = DEFAULT_SETTINGS;
  private toolbar = new ImageToolbar();
  private stylesInjector = new StylesInjector();
  private snippetClasses: SnippetClass[] = [];
  private activeImage: HTMLImageElement | null = null;
  private hoverShown = false; // true when the floating toolbar was opened by hover (so it dismisses on hover-out)
  private floatRegionCleanup: (() => void) | null = null; // unbinds the floating bar's image+bar active region (D6)
  private filterPanel: FilterPanel | null = null;
  private classPanel: ClassPanel | null = null;
  private submenu: AnchoredSubmenu | null = null;
  private cropEditor: CropEditor | null = null;
  private readingSections = new Map<HTMLElement, { ctx: MarkdownPostProcessorContext }>();

  async onload(): Promise<void> {
    addIcon(BRAND_ICON_ID, BRAND_ICON_SVG); // brand mark — usable via setIcon (editing-toolbar submenu, settings)
    registerLayoutIcons(); // the six layout icons (block/float/inline) — usable via setIcon (toolbar, editing-toolbar)
    await this.loadSettings();
    this.initLocale();
    this.stylesInjector.inject(this.settings.disabledInternalClasses, this.settings.presetWidths);
    this.applyTallFloatClass();
    this.applyButtonOutlines();

    this.addSettingTab(new LieSettingTab(this.app, this));
    this.registerMarkdownPostProcessor((el, ctx) => this.postProcessor(el, ctx));
    this.registerImageSelectionHandler();
    this.registerToolbarDismissHandlers();
    this.registerCommands();

    this.registerEvent(this.app.workspace.on("layout-change", () => this.reconcileFromSource()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.reconcileFromSource()));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (file.path === this.app.workspace.getActiveFile()?.path) this.scheduleReconcile();
    }));

    // An EditorView's create/destroy is a real render-lifecycle op (the LP extension runs in every
    // editor, the table cell editor included) — the close re-shows the static copy, which may
    // arrive from cache undecorated; never fires on hover/UI.
    this.registerEditorExtension(ViewPlugin.define(() => {
      this.scheduleReconcile();
      return { destroy: () => this.scheduleReconcile() };
    }));

    this.registerEditorExtension(
      Prec.highest(
        createLivePreviewExtension(
          this.app,
          () => this.app.workspace.getActiveFile()?.path ?? "",
          (img) => this.toolbarItemsForImage(img),
          () => this.settings.showCaptions,
          () => this.settings.defaultRevealState,
          () => this.settings.renderImagesInCodeBlocks,
          () => this.engagedImagePos(),
          () => {
            const desired = desiredFormat(this.useMarkdownLinks());
            const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
            return { desired, pathFor: (p: string) => this.canonicalPathToken(p, sourcePath, desired) };
          }
        )
      )
    );

    this.app.workspace.onLayoutReady(async () => {
      // The two are INDEPENDENT: a failing snippet scan must not skip the editing-toolbar migration.
      // They used to share one await chain, so a scanSnippets throw silently left a stale pre-rework
      // submenu (old class-*/toggle-inline entries) un-migrated until the next clean reload (observed
      // live). Isolate the scan; then self-heal / migrate the submenu once both plugins are up (no-op
      // when off).
      try { await this.refreshSnippets(); } catch (e) { console.error("[live-image-editor] snippet scan failed", e); }
      await ensureEditingToolbarButtons(this.app, this.settings.editingToolbarEnabled);
    });

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
    // Plugin unload: tear the panels down WITHOUT persisting (no source write while the plugin
    // is going away). Every USER-facing leave persists (auto-persist, AD8); unload is the one
    // silent teardown.
    this.closeFilterPanel(false);
    this.closeClassPanel(false);
    this.closeSubmenu(false);
    this.closeCrop(false);
    this.toolbar.hide();
    for (const toolbar of Array.from(activeDocument.querySelectorAll(`.${POSTPROCESSOR_TOOLBAR_CLASS}`))) {
      toolbar.remove();
    }
    for (const owner of Array.from(activeDocument.querySelectorAll(`.${TOOLBAR_ABOVE_CLASS}`))) {
      owner.classList.remove(TOOLBAR_ABOVE_CLASS, "lie-region-hover");
    }
    this.stylesInjector.remove();
    activeDocument.body.classList.remove("lie-safe-tall-float", "lie-btn-outline-always", "lie-btn-outline-never");
  }

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as Partial<LieSettings> & { alwaysShowLink?: boolean };
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    this.settings.presetWidths = Object.assign({}, DEFAULT_SETTINGS.presetWidths, this.settings.presetWidths);
    // Migrate the legacy boolean reveal setting (Object.assign won't translate it): a stored
    // `alwaysShowLink` maps to the three-state `defaultRevealState` — true → "always", false → "auto"
    // (the old `false` meant "auto / on-hover") — only when the new key was not already persisted.
    if ("alwaysShowLink" in raw && !("defaultRevealState" in raw)) {
      this.settings.defaultRevealState = raw.alwaysShowLink ? "always" : "auto";
    }
    delete (this.settings as { alwaysShowLink?: boolean }).alwaysShowLink;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.stylesInjector.inject(this.settings.disabledInternalClasses, this.settings.presetWidths);
    this.applyTallFloatClass();
    this.applyButtonOutlines();
    this.initLocale();
    this.refreshLivePreviewDecorations();
    this.reconcileFromSource();
  }

  // Tall-float cap: the setting flips a body class the stylesheet keys on to stack tall floats
  // as blocks (safe) or let them float (permissive). Governs Live Preview and Reading view alike.
  private applyTallFloatClass(): void {
    activeDocument.body.classList.toggle("lie-safe-tall-float", this.settings.tallFloatSafe);
  }

  // Button-outline a11y setting (Feature 2): the stylesheet keys "always"/"never" off a body class;
  // "auto" sets neither, leaving the media-query rule (prefers-contrast / forced-colors) in charge.
  private applyButtonOutlines(): void {
    const mode = this.settings.buttonOutlines;
    activeDocument.body.classList.toggle("lie-btn-outline-always", mode === "always");
    activeDocument.body.classList.toggle("lie-btn-outline-never", mode === "never");
  }

  // Public so the settings tab can force a live re-render after a setting that affects the LP render
  // (reveal mode, captions, code-block embeds, toolbar) — otherwise the open editor keeps the old
  // decorations until an unrelated edit, so the change looks like it "didn't take" (e.g. hover no longer
  // reveals after switching to auto/always).
  refreshLivePreviewDecorations(): void {
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
    // Snippet-class feature off → the dropdown is gone, so the flat list stays empty (no scan).
    // Already-applied classes still render via Obsidian's own enabled snippet (AB19/Q2).
    if (!this.settings.cssClassesEnabled) { this.snippetClasses = []; return; }
    // Only scan snippets ENABLED in Obsidian, not merely present in the folder (Decision 10).
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
    // Mounted-inside-editor host: the reconcile pass owns it.
    if (el.closest(".cm-editor")) { this.scheduleReconcile(); return; }
    // Attach at the section's mount (`onload`); a section is built detached.
    const child = new MarkdownRenderChild(el);
    child.onload = () => {
      const registration = { ctx };
      this.readingSections.set(el, registration);
      child.register(() => {
        if (this.readingSections.get(el) === registration) this.readingSections.delete(el);
      });
      const reconcile = (): void => this.reconcileReadingSection(el, ctx);
      for (const embed of Array.from(el.querySelectorAll(".internal-embed"))) {
        this.processBlock(embed as HTMLElement, () => embed.querySelector("img"), reconcile);
      }
      for (const img of Array.from(el.querySelectorAll("img"))) {
        if (img.closest(".internal-embed")) continue;
        this.processBlock(img, () => img, reconcile);
      }
      reconcile();
      window.requestAnimationFrame(reconcile);
    };
    ctx.addChild(child);
    // Reconcile mounted cached sections after layout settles.
    this.scheduleReconcile();
  }

  /** Removes a complete leading attribute block and returns its parsed source transform. */
  private stripBlockText(anchor: HTMLElement, location?: ImageLocation): ImageTransform | null {
    const textNode = this.findBlockTextNode(anchor);
    if (textNode) {
      const text = textNode.textContent ?? "";
      let start = 0;
      while (start < text.length && /\s/.test(text[start]!)) start++;
      const scanned = scanAttributeBlock(text, start);
      if (scanned) textNode.textContent = text.slice(scanned.end);
      if (!location && scanned) return parseAltText(scanned.inner);
    }
    return location ? parseAltText(location.params) : null;
  }

  private processBlock(
    anchor: HTMLElement,
    getImg: () => HTMLImageElement | null,
    onApply?: () => void
  ): void {
    const transform = this.stripBlockText(anchor);

    /** Decorate once the embed's img exists; a copy rendered hidden is decorated too. */
    const apply = (): boolean => {
      const img = getImg();
      if (!img) return false;
      // Fold the native size into the transform (an explicit {…} wins).
      const merged: ImageTransform = transform
        ? { ...transform, classes: [...transform.classes] }
        : { classes: [] };
      this.foldNativeSize(merged, img);
      // A `.cm-content` host always needs its replacement box (its native img is CSS-suppressed);
      // an untransformed reading-view host stays bare.
      if (this.hasTransforms(merged) || img.closest(".cm-content")) applyTransformToImage(img, merged);
      else this.clearStaleTransform(img);
      // Shrink-wrap marker on the host that holds the box.
      img.closest(`.${BOX_CLASS}`)?.parentElement?.classList.add("lie-embed");
      onApply?.();
      return true;
    };
    if (apply()) return;
    // Bounded wait for the embed's async img.
    const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
    observer.observe(anchor, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    window.setTimeout(() => observer.disconnect(), 5000);
  }

  private reconcileTimer = 0;
  private scheduleReconcile(): void {
    window.clearTimeout(this.reconcileTimer);
    this.reconcileTimer = window.setTimeout(() => this.reconcileFromSource(), 50);
  }

  private readingCaptions = new WeakMap<HTMLImageElement, CaptionHandle>();
  private postProcessorLocations = new WeakMap<HTMLImageElement, { doc: CmText; location: ImageLocation }>();

  /** Returns the visible adapter root for the active Markdown mode. */
  private adapterRoot(view: MarkdownView): HTMLElement | null {
    return view.contentEl.querySelector<HTMLElement>(
      view.getMode() === "preview" ? ".markdown-reading-view, .markdown-preview-view" : ".markdown-source-view"
    );
  }

  /** Converts one anchored embed scan into the source-location shape. */
  private toImageLocation(line: number, lineText: string, column: number, embed: ParsedEmbed): ImageLocation {
    return {
      line,
      start: column,
      headEnd: column + embed.headEnd,
      end: column + embed.end,
      isWikiLink: embed.format === "wiki",
      filename: embed.path,
      block: embed.block,
      params: embed.block ? embed.block.slice(1, -1) : "",
      alt: embed.alt,
      inTable: isTableRow(lineText),
    };
  }

  /** Returns parse-derived image locations wholly contained in a document range. */
  private parseLocationsInRange(cm: EditorView, from: number, to: number): ImageLocation[] | null {
    if (from < 0 || to < from || to > cm.state.doc.length) return null;
    try {
      const current = syntaxTree(cm.state);
      const tree = current.length >= to ? current : ensureSyntaxTree(cm.state, to, 100);
      if (!tree || tree.length < to) return null;

      const locations: ImageLocation[] = [];
      const seen = new Set<number>();
      const cursor = tree.cursor();
      do {
        if (!isImageEmbedNodeName(cursor.name)) continue;
        if (cursor.from < from || cursor.from >= to || seen.has(cursor.from)) continue;
        seen.add(cursor.from);
        const line = cm.state.doc.lineAt(cursor.from);
        const embed = scanEmbed(cm.state.doc.sliceString(cursor.from, line.to), 0);
        if (!embed || embed.start !== 0 || cursor.from + embed.end > to) return null;
        locations.push(this.toImageLocation(line.number - 1, line.text, cursor.from - line.from, embed));
      } while (cursor.next());
      locations.sort((a, b) => a.line - b.line || a.start - b.start);
      return locations;
    } catch {
      return null;
    }
  }

  /** Returns owned post-processor images once each in DOM order. */
  private postProcessorImages(root: ParentNode, block?: HTMLElement): HTMLImageElement[] | null {
    const images: HTMLImageElement[] = [];
    const seen = new Set<HTMLImageElement>();
    for (const node of Array.from(root.querySelectorAll<HTMLElement>(".internal-embed, img"))) {
      if (node.matches(".internal-embed")) {
        if (node.closest(".lie-caption")) continue;
        if (block && node.closest(POSTPROCESSOR_BLOCK_SELECTOR) !== block) continue;
        const owned = Array.from(node.querySelectorAll<HTMLImageElement>("img")).filter((candidate) =>
          candidate.closest(".internal-embed") === node && !candidate.closest(".lie-caption")
        );
        if (owned.length !== 1 || seen.has(owned[0]!)) return null;
        seen.add(owned[0]!);
        images.push(owned[0]!);
        continue;
      }
      const img = node as HTMLImageElement;
      if (img.closest(".internal-embed") || img.closest(".lie-caption")) continue;
      if (block && img.closest(POSTPROCESSOR_BLOCK_SELECTOR) !== block) continue;
      if (seen.has(img)) return null;
      seen.add(img);
      images.push(img);
    }
    return images;
  }

  /** Clears derived post-processor addresses within a render context. */
  private clearPostProcessorLocations(root: ParentNode): void {
    for (const img of Array.from(root.querySelectorAll("img"))) this.postProcessorLocations.delete(img);
  }

  /** Returns the exact source range owned by one Live Preview render block. */
  private livePreviewBlockRange(cm: EditorView, block: HTMLElement): { from: number; to: number } | null {
    const from = cm.posAtDOM(block, 0);
    const domTo = cm.posAtDOM(block, block.childNodes.length);
    if (domTo < from) return null;
    if (domTo > from) return { from, to: domTo };

    const line = cm.lineBlockAt(from);
    if (line.type !== BlockType.WidgetRange || line.from !== from || line.to <= from) return null;
    return { from, to: line.to };
  }

  /** Pairs one Live Preview render block with source locations from its main editor range. */
  private pairLivePreviewBlock(
    cm: EditorView,
    block: HTMLElement
  ): { identity: HTMLImageElement; location: ImageLocation }[] | null {
    this.clearPostProcessorLocations(block);
    const images = this.postProcessorImages(block, block);
    if (!images) return null;
    try {
      const range = this.livePreviewBlockRange(cm, block);
      if (!range) return null;
      const { from, to } = range;
      const locations = this.parseLocationsInRange(cm, from, to);
      if (!locations) return null;
      const pairs = pairImageLocations(
        images.map((identity) => ({ identity, source: getImageFilename(identity) ?? "" })),
        locations
      );
      if (!pairs) return null;
      for (const pair of pairs) this.postProcessorLocations.set(pair.identity, { doc: cm.state.doc, location: pair.location });
      return pairs;
    } catch {
      return null;
    }
  }

  /** Returns cache-confirmed source locations for the current immutable document. */
  private readingLocations(file: TFile, doc: CmText): ImageLocation[] | null {
    const embeds = this.app.metadataCache.getFileCache(file)?.embeds ?? [];
    const locations: ImageLocation[] = [];
    const seen = new Set<number>();
    for (const cached of embeds) {
      const { start, end } = cached.position;
      if (start.line !== end.line || start.line < 0 || start.line >= doc.lines) return null;
      const line = doc.line(start.line + 1);
      if (
        start.col < 0 || end.col < start.col ||
        line.from + start.col !== start.offset ||
        line.from + end.col !== end.offset ||
        start.offset < line.from || end.offset > line.to ||
        doc.sliceString(start.offset, end.offset) !== cached.original ||
        seen.has(start.offset)
      ) return null;
      const embed = scanEmbed(doc.sliceString(start.offset, line.to), 0);
      if (
        !embed || embed.start !== 0 ||
        embed.headEnd !== cached.original.length ||
        start.offset + embed.headEnd !== end.offset ||
        start.offset + embed.end > line.to
      ) return null;
      seen.add(start.offset);
      locations.push(this.toImageLocation(start.line, line.text, start.col, embed));
    }
    locations.sort((a, b) => a.line - b.line || a.start - b.start);
    return locations;
  }

  /** Pairs one Reading View post-processor section with its bounded source embeds. */
  private pairReadingSection(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): { identity: HTMLImageElement; location: ImageLocation }[] | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "preview") return null;
    const file = view.file;
    if (!file || file.path !== ctx.sourcePath) return null;
    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    if (!cm || cm.state.doc.toString() !== view.editor.getValue()) return null;
    this.clearPostProcessorLocations(el);
    const images = this.postProcessorImages(el);
    if (!images) return null;
    const allLocations = this.readingLocations(file, cm.state.doc);
    if (!allLocations) return null;
    const section = ctx.getSectionInfo(el);
    if (!section || section.lineEnd >= cm.state.doc.lines) return null;
    const locations = locationsInLineRange(allLocations, section.lineStart, section.lineEnd);
    if (!locations) return null;
    const pairs = pairImageLocations(
      images.map((identity) => ({ identity, source: getImageFilename(identity) ?? "" })),
      locations
    );
    if (!pairs) return null;
    for (const pair of pairs) {
      this.postProcessorLocations.set(pair.identity, { doc: cm.state.doc, location: pair.location });
    }
    return pairs;
  }

  /** Returns current-document cached Reading View section pairs. */
  private cachedReadingPairs(
    container: ParentNode,
    editor: Editor,
    doc: CmText
  ): { identity: HTMLImageElement; location: ImageLocation }[] | null {
    const images = this.postProcessorImages(container);
    if (!images) return null;
    const current = currentDocumentLocationPairs(
      images,
      images.map((identity) => {
        const cached = this.postProcessorLocations.get(identity);
        return cached ? { identity, doc: cached.doc, location: cached.location } : null;
      }),
      doc
    );
    if (!current) return null;
    const pairs: { identity: HTMLImageElement; location: ImageLocation }[] = [];
    for (const { identity, location: cached } of current) {
      const source = getImageFilename(identity);
      if (!source) return null;
      const location = this.reparseLocation(editor, cached, cached.filename);
      if (!location || basename(location.filename) !== basename(source)) return null;
      this.postProcessorLocations.set(identity, { doc, location });
      pairs.push({ identity, location });
    }
    return pairs;
  }

  /** Remaps connected registered Reading View sections in the active root. */
  private remapReadingSections(container: HTMLElement): boolean {
    let found = false;
    for (const [el, registration] of this.readingSections) {
      if (!el.isConnected || !container.contains(el)) continue;
      found = true;
      if (!this.pairReadingSection(el, registration.ctx)) return false;
    }
    return found;
  }

  /** Applies source-derived render state to paired post-processor images. */
  private applySourcePairs(
    pairs: readonly { identity: HTMLImageElement; location: ImageLocation }[],
    sourcePath: string
  ): void {
    for (const { identity: img, location } of pairs) {
      if (img.closest(".lie-cropping")) continue;
      const anchor = img.closest<HTMLElement>(".internal-embed") ?? img;
      const transform = this.stripBlockText(anchor, location) ?? parseAltText(location.params);
      this.foldNativeSize(transform, img, location.alt);
      if (this.hasTransforms(transform) || img.closest(".cm-content")) applyTransformToImage(img, transform);
      else this.clearStaleTransform(img);
      img.closest(`.${BOX_CLASS}`)?.parentElement?.classList.add("lie-embed");
      this.reconcilePostProcessorToolbar(img);
      this.applyReadingCaption(img, sourcePath, location.alt);
    }
  }

  /** Reconciles one shared-model toolbar into a wrapperless Live Preview image area. */
  private reconcilePostProcessorToolbar(img: HTMLImageElement): void {
    const host = img.closest<HTMLElement>(".internal-embed.image-embed.lie-embed");
    const existing = host?.querySelector<HTMLElement>(`.${POSTPROCESSOR_TOOLBAR_CLASS}`) ?? null;
    const owner = editorToolbarOwner(img);
    const area = img.closest<HTMLElement>(`.${BOX_CLASS}`);
    if (!host || owner !== host || !area || !this.settings.showToolbar) {
      existing?.remove();
      host?.classList.remove(TOOLBAR_ABOVE_CLASS, "lie-region-hover");
      return;
    }
    if (existing?.parentElement === area) return;
    existing?.remove();
    const toolbar = buildToolbarElement(this.toolbarItemsForImage(img));
    toolbar.classList.add("lie-toolbar-in-image", POSTPROCESSOR_TOOLBAR_CLASS);
    toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
    toolbar.addEventListener("mousedown", (event) => event.stopPropagation());
    area.appendChild(toolbar);
  }

  /** Reconciles one mounted Reading View post-processor section. */
  private reconcileReadingSection(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const pairs = this.pairReadingSection(el, ctx);
    if (pairs) this.applySourcePairs(pairs, ctx.sourcePath);
  }

  private readingCaptionText = new WeakMap<HTMLImageElement, string>();

  // Reading-view caption (F22): render the alt text as a Markdown caption below the box, as a child
  // of the embed (sized to the box by pure CSS, AB7). Idempotent. `sourceAlt` is the AUTHOR's alt —
  // resolved by the caller from the source text (position-exact), never the rendered `alt` attribute
  // (Obsidian defaults that to the bare filename for an un-aliased embed, Bug 121).
  private applyReadingCaption(img: HTMLImageElement, sourcePath: string, sourceAlt: string): void {
    const want = this.settings.showCaptions ? captionFromAlt(sourceAlt) : "";
    const prev = this.readingCaptions.get(img);
    if (prev && want && this.readingCaptionText.get(img) === want && prev.el.isConnected) return;

    if (prev) {
      prev.el.remove();
      prev.destroy();
      this.readingCaptions.delete(img);
      this.readingCaptionText.delete(img);
    }

    const box = img.closest<HTMLElement>(`.${BOX_CLASS}`);
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

  /** Canonical path token for `desired`, or null when unresolvable/unparseable (the caller then
   *  keeps the source form). A `#`/`^` subpath is re-attached as written. */
  private canonicalPathToken(path: string, sourcePath: string, desired: LinkFormat): string | null {
    try {
      const bare = stripLinkSubpath(path);
      const subpath = path.slice(bare.length);
      let linkpath = bare;
      try { linkpath = decodeURIComponent(bare); } catch { /* keep the raw form */ }
      const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      if (!(file instanceof TFile)) return null;
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath); // never an alias arg (Lesson 5)
      const token = pathFromGeneratedLink(link, desired);
      return token === null ? null : token + subpath;
    } catch {
      return null;
    }
  }

  /** Reconcile run counter (read by the CDP guards). */
  reconcileRunCount = 0;

  /** Reconciles owned post-processor images with their paired current source locations. */
  private reconcileFromSource(): void {
    this.reconcileRunCount++;
    const run = () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      const container = this.adapterRoot(view);
      if (!container) return;
      const source = view.editor?.getValue() ?? "";
      const file = view.file;
      if (!file) return;
      const sourcePath = file.path;
      const cm = (view.editor as unknown as { cm?: EditorView } | undefined)?.cm;
      if (!cm || cm.state.doc.toString() !== source) return;

      let pairs: { identity: HTMLImageElement; location: ImageLocation }[] = [];
      if (view.getMode() === "preview") {
        let readingPairs = this.cachedReadingPairs(container, view.editor, cm.state.doc);
        if (!readingPairs && this.remapReadingSections(container)) {
          readingPairs = this.cachedReadingPairs(container, view.editor, cm.state.doc);
        }
        if (!readingPairs) return;
        pairs = readingPairs;
      } else {
        for (const host of Array.from(container.querySelectorAll<HTMLElement>(".cm-content .internal-embed"))) {
          if (host.closest(".markdown-rendered")) continue;
          for (const caption of Array.from(host.querySelectorAll(".lie-caption"))) caption.remove();
        }

        for (const block of Array.from(container.querySelectorAll<HTMLElement>(POSTPROCESSOR_BLOCK_SELECTOR))) {
          const blockPairs = this.pairLivePreviewBlock(cm, block);
          if (blockPairs) pairs.push(...blockPairs);
        }
      }

      this.applySourcePairs(pairs, sourcePath);
    };
    run();
    window.requestAnimationFrame(run);
  }

  // A reused (Obsidian-cached) embed whose source no longer carries a {…} block must return to
  // its NATIVE-default state. Per the AD3 box invariant the box is NEVER emptied to a naked img:
  // we re-render the 3-layer box with an EMPTY transform — exactly what reset() does — so the
  // image keeps its uniform wrapper and shows at its native (column-capped) size (Bug 79). The
  // old `unwrapBox` here stripped the box, leaving a naked img (invariant violation) and was
  // unique to this path; nothing else unwraps, so dropping it is safe.
  private clearStaleTransform(img: HTMLImageElement | null): void {
    if (!img) return;
    // Ours iff it's inside our 3-layer box (always wrapped per the AD3 box invariant). The `lie-inline`
    // marker now rides the outer, not the img (Decision 28), so the box check is the sole signal.
    const ours = !!img.closest(`.${BOX_CLASS}`);
    if (ours) applyTransformToImage(img, { classes: [] });
  }

  private findBlockTextNode(anchor: Element): Text | null {
    let node: Node | null = anchor.nextSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (text.trim() === "") { node = node.nextSibling; continue; }
        return node as Text;
      }
      return null;
    }
    return null;
  }

  // Every member of the combined active region (D6): with NO panel open, a click on any of these is
  // "inside" and never dismisses the bare toolbar (the image wrapper, the toolbar, the sub-panels,
  // a lightweight palette, the crop chrome). The class panel (`.lie-class-panel`, a `.lie-submenu`)
  // is a region member too, so picking a class no longer dismisses the toolbar out from under the
  // user (Bug 64 / Bug 88).
  private static readonly REGION_SELECTOR =
    ".lie-toolbar, .lie-filter-panel, .lie-class-panel, .lie-submenu, .lie-group-popup, .lie-cropping, .lie-wrapper";

  // While a modal FILTER/SIZE panel is open the click-away boundary SHRINKS to this: the sub-panel
  // itself plus the toolbar chrome docked to it. A click anywhere else — the image INCLUDED — closes+
  // persists the panel (Bug 62 follow-up). The image is NOT a safe harbor: it fills most of the
  // canvas, so treating it as "inside" left the panel stuck open when the user clicked the image to
  // dismiss it. (Hover visibility still spans the whole region — that's `REGION_SELECTOR` above.)
  private static readonly PANEL_SELECTOR = ".lie-submenu, .lie-filter-panel, .lie-toolbar";

  // AD12 — the engagement state read through the ONE pure `isEngaged` predicate (toolbar-region-logic),
  // replacing the per-site `filterPanel || classPanel || submenu || cropEditor` chains. `anyPanelOpen`
  // is the filter/class/size sub-panel subset (excludes crop); `anySurfaceOpen` is the full
  // plugin-surface union (panels + crop) — the "is an editing surface holding an image?" check the Esc /
  // overlay-dismiss / hover-leave paths consult (cursor/hover/selection don't gate THOSE decisions, so
  // they pass false). The full predicate (adding cursor/hover/selected) drives the reveal pin (AB16b).
  private anyPanelOpen(): boolean {
    return !!this.filterPanel || !!this.classPanel || !!this.submenu;
  }
  private anySurfaceOpen(): boolean {
    return isEngaged({ cursorOnLine: false, hover: false, selected: false, panelOpen: this.anyPanelOpen(), cropActive: !!this.cropEditor });
  }

  // AD12 → AB16b reveal PIN (Bug 86): the document POSITION of the image currently ENGAGED via an open
  // plugin surface (crop / filter / class / sub-menu), so the LP StateField keeps THAT embed's link
  // revealed and it does NOT flip mid-interaction whatever the cursor does. The position (not the line)
  // lets the build pin the exact embed — a standalone occupies the whole line, an inline embed only its
  // own span, so a sibling inline embed on the same line is NOT over-pinned. null when no surface is open
  // or the active image can't be resolved. Read fresh by `createLivePreviewExtension`'s build.
  engagedImagePos(): number | null {
    if (!this.anySurfaceOpen() || !this.activeImage?.isConnected) return null;
    const wrapper = this.activeImage.closest<HTMLElement>(".lie-wrapper");
    if (!wrapper) return null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const cm = (view.editor as unknown as { cm?: EditorView }).cm;
      if (!cm || !cm.dom.contains(wrapper)) continue;
      try { return cm.posAtDOM(wrapper); } catch { return null; }
    }
    return null;
  }

  private registerImageSelectionHandler(): void {
    const onToolbarPresentationChange: EventListener = (event: Event) => {
      const owner = event.target;
      if (!(owner instanceof HTMLElement) || !owner.isConnected || !owner.closest(".markdown-source-view")) return;
      queueMicrotask(() => {
        if (!owner.isConnected || !owner.closest(".markdown-source-view")) return;
        const img = owner.querySelector<HTMLImageElement>(".lie-image-area > .lie-frame > img");
        if (!img || (this.activeImage !== img && !owner.matches(":hover"))) return;
        const above = owner.classList.contains(TOOLBAR_ABOVE_CLASS);
        const controllerImage = this.toolbar.getActiveImage();
        if ((above && controllerImage !== img) || (!above && controllerImage === img)) {
          this.onImageSelected(img);
        }
        if (owner.matches(":hover") && owner.classList.contains(TOOLBAR_ABOVE_CLASS)
          && this.toolbar.getActiveImage() === img) {
          this.hoverShown = true;
          this.bindFloatRegion(owner);
        }
      });
    };
    activeDocument.addEventListener(TOOLBAR_PRESENTATION_CHANGE_EVENT, onToolbarPresentationChange);
    this.register(() => activeDocument.removeEventListener(TOOLBAR_PRESENTATION_CHANGE_EVENT, onToolbarPresentationChange));

    this.registerDomEvent(activeDocument, "click", (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;
      const panelOpen = this.anyPanelOpen();
      // Re-select an image on click ONLY when the bar is "bare" — no modal panel open, not cropping.
      // While a filter/size panel is open an image click is an OUTSIDE-THE-PANEL click → it must
      // CLOSE+persist the panel (handled below), not re-select. Crop owns its clicks entirely — the
      // session ends only via its own controls (toggle / ✓ / ✗ / Esc).
      if (target.tagName === "IMG" && target.closest(".markdown-source-view") && !this.cropEditor && !panelOpen) {
        this.hoverShown = false; // click-shown: stays until click-outside, not hover-out
        this.onImageSelected(target as HTMLImageElement);
      } else if (clickDismissesToolbar({
        cropActive: !!this.cropEditor,
        panelOpen,
        insidePanel: !!target.closest(LiveImageEditorPlugin.PANEL_SELECTOR),
        insideRegion: !!target.closest(LiveImageEditorPlugin.REGION_SELECTOR),
      })) {
        // The click-away CLOSE (Bug 62 + boundary follow-up):
        //   • a FILTER/SIZE panel open → a click outside the sub-panel (the image included) closes it
        //     and PERSISTS the working state (auto-persist, one source write);
        //   • no panel → dismiss the bare toolbar only on a click outside the whole region;
        //   • CROP active → `clickDismissesToolbar` returns false, so no stray click can destroy the
        //     in-place session.
        // Hover-leave only HIDES (the panel stays open, Bug 63); this click path closes.
        this.dismissToolbar();
      }
    });

    // HOVER reflows each source-view wrapper before opening the body presentation only for an owner
    // marked `lie-toolbar-above`. The body bar and image share one grace-bridged hover region.
    this.registerDomEvent(activeDocument, "mouseover", (evt: MouseEvent) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(".lie-toolbar, .lie-group-popup, .lie-class-panel, .lie-submenu, .lie-filter-panel, .lie-cropping")) return;
      const floatWrap = target.closest<HTMLElement>(".markdown-source-view .lie-wrapper");
      if (floatWrap) {
        const img = floatWrap.querySelector<HTMLImageElement>("img");
        const inset = floatWrap.querySelector<HTMLElement>(".lie-toolbar-in-image");
        if (inset) reflowToolbar(inset);
        if (img && floatWrap.classList.contains(TOOLBAR_ABOVE_CLASS)
          && this.settings.showToolbar && this.toolbar.getActiveImage() !== img) {
          this.onImageSelected(img);
          this.hoverShown = true;
          this.bindFloatRegion(floatWrap);
        }
        return;
      }
      // Wrapperless post-processor embeds inside Live Preview use their exact decorated `.lie-embed`
      // owner. Reading View is excluded by the source-view selector.
      const embedHost = target.closest<HTMLElement>(
        ".markdown-source-view .internal-embed.image-embed.lie-embed"
      );
      if (embedHost) {
        const img = embedHost.querySelector("img");
        const inset = embedHost.querySelector<HTMLElement>(".lie-toolbar-in-image");
        if (inset) reflowToolbar(inset);
        const needsFloating = embedHost.classList.contains(TOOLBAR_ABOVE_CLASS);
        const floatingImage = this.toolbar.getActiveImage();
        const presentationMismatch = needsFloating ? floatingImage !== img : floatingImage === img;
        if (img && this.settings.showToolbar && (this.activeImage !== img || presentationMismatch)) {
          this.onImageSelected(img);
          this.hoverShown = true;
          this.bindFloatRegion(embedHost);
        }
      }
    });
  }

  // Bind the floating bar's image + bar as ONE active region (D6), the SAME `bindRegionHover` the panels
  // use — so the image→bar travel across the gap above the image is graced (160ms) and the bar stays
  // reachable. Dismiss fires only when the WHOLE region is left (and no panel/palette governs it).
  private bindFloatRegion(floatWrap: HTMLElement): void {
    this.floatRegionCleanup?.();
    const bar = activeDocument.querySelector<HTMLElement>(".lie-toolbar-floating");
    this.floatRegionCleanup = bindRegionHover([floatWrap, bar], (active) => {
      if (!active && !this.anySurfaceOpen() && !activeDocument.querySelector(".lie-group-popup")) {
        this.dismissToolbar();
      }
    });
  }

  private registerToolbarDismissHandlers(): void {
    const overlaySelector = ".modal-container, .menu, .prompt, .suggestion-container";
    const observer = new MutationObserver((mutations) => {
      if (!this.toolbar.isVisible() && !this.anySurfaceOpen()) return;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.instanceOf(HTMLElement) && node.matches(overlaySelector)) { this.dismissToolbar(); return; }
        }
      }
    });
    observer.observe(activeDocument.body, { childList: true });
    this.register(() => observer.disconnect());

    this.registerDomEvent(activeDocument, "keydown", (evt: KeyboardEvent) => {
      if (evt.key !== "Escape") return;
      if (this.anySurfaceOpen()) return;
      this.dismissToolbar();
    });
    this.registerDomEvent(window, "blur", () => this.dismissToolbar());
  }

  private dismissToolbar(): void {
    this.floatRegionCleanup?.();
    this.floatRegionCleanup = null;
    this.closeFilterPanel();
    this.closeClassPanel();
    this.closeSubmenu();
    this.closeCrop();
    this.toolbar.hide();
    this.activeImage = null;
    this.hoverShown = false;
  }

  private onImageSelected(img: HTMLImageElement): void {
    if (!this.settings.showToolbar) return;
    if (!img.closest(".lie-wrapper")) this.reconcilePostProcessorToolbar(img);
    const owner = editorToolbarOwner(img);
    const inset = owner?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null;
    if (inset) reflowToolbar(inset);
    if (img !== this.activeImage) {
      this.closeFilterPanel();
      this.closeClassPanel();
      this.closeSubmenu();
      this.closeCrop();
    }
    this.activeImage = img;
    if (owner && !owner.classList.contains(TOOLBAR_ABOVE_CLASS)) {
      this.toolbar.hide();
      return;
    }
    this.toolbar.show(img, this.toolbarItemsForImage(img));
  }

  private toolbarItemsForImage(img: HTMLImageElement): ToolbarItem[] {
    // A layout button (id === its Layout value) is highlighted when it matches the image's current
    // layout (radio active-state); recomputed per show, so the open toolbar always reflects the image.
    const cur = currentLayout(img);
    const bind = (b: ToolbarButton): ToolbarButton => ({
      ...b,
      active: LAYOUTS.includes(b.id as Layout) ? b.id === cur : b.active,
      action: () => { this.activeImage = img; b.action(); },
    });
    // The `<>` reveal is a normal toolbar item — ONE toolbar model both presentations render. Leftmost,
    // with per-show state read off the wrapper: dismissed → `is-off` + the label flips to "reveal". Its
    // action resolves the editor itself (toggleEmbedReveal → findFromDOM), so it works floating too.
    const dismissed = !!img.closest(".lie-wrapper")?.classList.contains("lie-dismissed");
    const reveal: ToolbarButton = {
      kind: "button", id: "reveal", icon: "code",
      titleKey: dismissed ? "revealLink" : "hideLinkSource",
      className: dismissed ? "lie-toolbar-reveal is-off" : "lie-toolbar-reveal",
      action: () => toggleEmbedReveal(img),
    };
    return [reveal, ...this.buildToolbarItems()].map((it) =>
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
      kind: "group", id: "layout", icon: "text-quote", titleKey: "layout", collapse: "auto",
      buttons: [
        b("block-left", LAYOUT_ICON_ID["block-left"], "layoutBlockLeft", () => this.applyLayout("block-left")),
        b("block-center", LAYOUT_ICON_ID["block-center"], "layoutBlockCenter", () => this.applyLayout("block-center")),
        b("block-right", LAYOUT_ICON_ID["block-right"], "layoutBlockRight", () => this.applyLayout("block-right")),
        b("float-left", LAYOUT_ICON_ID["float-left"], "layoutFloatLeft", () => this.applyLayout("float-left")),
        b("float-right", LAYOUT_ICON_ID["float-right"], "layoutFloatRight", () => this.applyLayout("float-right")),
        b("inline", LAYOUT_ICON_ID["inline"], "layoutInline", () => this.applyLayout("inline")),
      ],
    };

    return [
      editGroup,
      b("filters", "blend", "filters", () => this.toggleFilters()),
      b("custom-size", "image-upscale", "customSize", () => this.customSize()),
      layoutGroup,
      // The CSS-class dropdown is gated by the snippet-class feature toggle (AB19). Alignment/inline
      // (the layout group above) are core and stay regardless.
      ...(this.settings.cssClassesEnabled ? [b("snippets", "braces", "snippets", () => this.addClass())] : []),
      b("export", "image-down", "export", () => { void this.exportImage(); }),
      b("reset", "eraser", "reset", () => this.reset()),
    ];
  }

  private registerCommands(): void {
    // Image-specific command actions are MULTI-AWARE (F19, 0.5.2): with ≥2 images inside the
    // editor selection each runs on all of them in one undo step; otherwise on the single
    // hover/cursor image. `runTransformCommand` carries the relative/set transform; the
    // interactive panels (filters/customSize/addClass) and the single-only crop/export each
    // resolve their own target. The gate (`canRun`) is the shared "is there any target?" check.
    const single = (run: () => void): void => {
      const img = this.commandSingleImage();
      if (img) { this.activeImage = img; run(); }
    };
    const handler: CommandHandler = {
      canRun: () => this.commandScope() !== null,
      rotateCw: () => this.runTransformCommand(ROTATE_CW),
      rotateCcw: () => this.runTransformCommand(ROTATE_CCW),
      flipH: () => this.runTransformCommand(toggleFlipH),
      flipV: () => this.runTransformCommand(toggleFlipV),
      crop: () => single(() => this.crop()),
      toggleFilters: () => this.commandFilters(),
      sizeSmall: () => this.runTransformCommand((t) => setWidthPx(t, this.settings.presetWidths.small)),
      sizeMedium: () => this.runTransformCommand((t) => setWidthPx(t, this.settings.presetWidths.medium)),
      sizeLarge: () => this.runTransformCommand((t) => setWidthPx(t, this.settings.presetWidths.large)),
      layoutBlockLeft: () => this.commandLayout("block-left"),
      layoutBlockCenter: () => this.commandLayout("block-center"),
      layoutBlockRight: () => this.commandLayout("block-right"),
      layoutFloatLeft: () => this.commandLayout("float-left"),
      layoutFloatRight: () => this.commandLayout("float-right"),
      layoutInline: () => this.commandLayout("inline"),
      addClass: () => this.commandAddClass(),
      reset: () => this.runTransformCommand(clearTransform),
      customSize: () => this.commandCustomSize(),
      exportImage: () => single(() => { void this.exportImage(); }),
      replaceImage: () => single(() => this.replaceImage()),
      replaceAllImages: () => single(() => this.replaceAllImages()),
      resetAllImages: () => this.resetAllImages(),
    };
    registerCommands(this, handler);
  }

  // The TARGET image for an image-specific command (F19). Prefer the still-connected hover/click-
  // active image; otherwise — the command-palette / hotkey case, where opening the palette has
  // already dismissed the hover state — resolve the image on the editor's CURSOR line. Returns
  // null when neither yields one (no image in context → the command stays out of the palette).
  // Editor-only: the cursor is meaningful in source/live-preview, not in reading view.
  private resolveCommandImage(): HTMLImageElement | null {
    if (this.activeImage?.isConnected) return this.activeImage;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "source") return null;
    const cursor = view.editor.getCursor();
    const loc = firstEmbedInLine(view.editor.getLine(cursor.line), cursor.line);
    return loc ? this.findRenderedImage(loc) : null;
  }

  // The SCOPE of an image-specific command (0.5.2): if the editor selection covers ≥2 image embeds
  // the command runs on ALL of them ("multi"); otherwise on the single hover/cursor image. The
  // toolbar buttons never reach this — they stay single (they call the methods directly).
  private commandScope():
    | { kind: "multi"; editor: Editor; locations: ImageLocation[] }
    | { kind: "single"; img: HTMLImageElement }
    | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view && view.getMode() === "source") {
      const locations = this.selectionTargets(view.editor);
      if (locations.length >= 2) return { kind: "multi", editor: view.editor, locations };
    }
    const img = this.resolveCommandImage();
    return img ? { kind: "single", img } : null;
  }

  // Every image embed that a NON-EMPTY editor selection overlaps, in source order — the target set
  // for multi-image commands. Empty selections (bare cursors) are ignored here: a single image with
  // no range is the "single" scope, handled by `resolveCommandImage`. Multi-cursor is supported (any
  // non-empty range counts). Offsets are absolute so the overlap test is a simple interval check.
  private selectionTargets(editor: Editor): ImageLocation[] {
    const ranges = editor.listSelections()
      .map((s) => {
        const a = editor.posToOffset(s.anchor);
        const h = editor.posToOffset(s.head);
        return [Math.min(a, h), Math.max(a, h)] as const;
      })
      .filter(([lo, hi]) => lo !== hi);
    if (ranges.length === 0) return [];
    const embeds = allEmbedsInText(editor.getValue());
    const spans = embeds.map((e) =>
      [editor.posToOffset({ line: e.line, ch: e.start }), editor.posToOffset({ line: e.line, ch: e.end })] as const
    );
    return spansOverlappingRanges(spans, ranges).map((i) => embeds[i]!);
  }

  // The single target for an inherently single-image command (crop, export) even when a multi
  // selection exists: the hover/cursor image, else the first selected image.
  private commandSingleImage(): HTMLImageElement | null {
    const scope = this.commandScope();
    if (!scope) return null;
    if (scope.kind === "single") return scope.img;
    return this.resolveCommandImage() ?? this.findRenderedImage(scope.locations[0]!);
  }

  // Run a transform command over its scope: multi → apply the modifier to every selected image in
  // one undo step; single → the existing single-image path (live preview + one write).
  private runTransformCommand(modifier: (t: ImageTransform) => void): void {
    const scope = this.commandScope();
    if (!scope) return;
    if (scope.kind === "multi") { this.modifyTransformMulti(scope.editor, scope.locations, modifier); return; }
    this.activeImage = scope.img;
    this.modifyTransform(modifier);
  }

  // Layout is the one command whose multi semantics differ from single: a single image TOGGLES the
  // state (matching the toolbar), but a selection SETS every image to that layout (the intuitive
  // "make all these float-left" — not a per-image toggle that would scatter the result).
  private commandLayout(layout: Layout): void {
    const scope = this.commandScope();
    if (!scope) return;
    if (scope.kind === "multi") { this.modifyTransformMulti(scope.editor, scope.locations, (t) => { t.layout = layout; }); return; }
    this.activeImage = scope.img;
    this.applyLayout(layout);
  }

  // --- Interactive multi-image commands (0.5.2) ---------------------------------------------------
  // Filters / custom size / CSS classes act on a SELECTION the same way the single versions act on
  // one image — only the panel goes STANDALONE (centered, titled "N images", D-decision) and the
  // preview/commit fan out to every selected image. Single scope → the existing single panels.

  private commandFilters(): void {
    const scope = this.commandScope();
    if (!scope) return;
    if (scope.kind === "single") { this.activeImage = scope.img; this.toggleFilters(); return; }
    this.openMultiFilters(scope.editor, scope.locations);
  }

  private commandCustomSize(): void {
    const scope = this.commandScope();
    if (!scope) return;
    if (scope.kind === "single") { this.activeImage = scope.img; this.customSize(); return; }
    this.openMultiSize(scope.editor, scope.locations);
  }

  private commandAddClass(): void {
    const scope = this.commandScope();
    if (!scope) return;
    if (scope.kind === "single") { this.activeImage = scope.img; this.addClass(); return; }
    this.openMultiClass(scope.editor, scope.locations);
  }

  private multiTitle(n: number): string {
    return t("multiImages").replace("{n}", String(n));
  }

  /** Returns exact source-to-render pairs for uniquely addressable locations. */
  private renderedPairs(locations: ImageLocation[]): { loc: ImageLocation; img: HTMLImageElement }[] {
    const out: { loc: ImageLocation; img: HTMLImageElement }[] = [];
    for (const loc of locations) {
      const img = this.findRenderedImage(loc);
      if (img) out.push({ loc, img });
    }
    return out;
  }

  // Centered size panel over a selection: SETS width/height/inline on all (the "make all 400 wide"
  // case). Preview re-renders each image with the new size while keeping its other transforms;
  // commit writes all in one undo step; cancel restores each from its source.
  private openMultiSize(editor: Editor, locations: ImageLocation[]): void {
    if (this.submenu) { this.closeSubmenu(); return; }
    const pairs = this.renderedPairs(locations);
    const first = parseAltText(locations[0]!.params);
    const state: SizeState = { width: first.width ?? null, height: first.height ?? null };
    const preview = (s: SizeState): void => {
      for (const { loc, img } of pairs) {
        const tr = parseAltText(loc.params);
        tr.width = s.width ?? undefined;
        tr.height = s.height ?? undefined;
        applyTransformToImage(img, tr);
      }
    };
    const sizeBody = buildSizeBody({ width: first.width, height: first.height }, preview, state, this.settings.presetWidths);
    const submenu = new AnchoredSubmenu();
    submenu.open({
      body: sizeBody.body,
      placement: "centered",
      title: this.multiTitle(locations.length),
      onReset: () => sizeBody.reset(),
      onCommit: () => this.modifyTransformMulti(editor, locations, (tr) => { tr.width = state.width ?? undefined; tr.height = state.height ?? undefined; }),
      onCancel: () => { for (const { loc, img } of pairs) applyTransformToImage(img, parseAltText(loc.params)); },
      onClose: () => { this.submenu = null; this.refreshLivePreviewDecorations(); },
    });
    this.submenu = submenu;
  }

  // Centered filter panel over a selection: preview fans out to all, commit writes all in one undo
  // step, cancel restores each. The histogram tracks the first selected image.
  private openMultiFilters(editor: Editor, locations: ImageLocation[]): void {
    if (this.filterPanel) { this.closeFilterPanel(); return; }
    const pairs = this.renderedPairs(locations);
    const histImg = pairs[0]?.img;
    if (!histImg) return;
    const originalFilter = getFilter(parseAltText(locations[0]!.params));
    const panel = new FilterPanel(histImg, originalFilter, {
      onPreview: (f: FilterData) => { for (const { img } of pairs) applyFilterPreview(img, f); },
      onCommit: (f: FilterData) => this.modifyTransformMulti(editor, locations, (tr) => setFilter(tr, Object.keys(f).length ? f : undefined)),
      onCancel: () => { for (const { loc, img } of pairs) applyTransformToImage(img, parseAltText(loc.params)); },
      onClose: () => { this.filterPanel = null; this.refreshLivePreviewDecorations(); },
    });
    panel.open(null, null, this.multiTitle(locations.length));
    this.filterPanel = panel;
  }

  // Centered class picker over a selection (Bug 88): the SAME sub-panel as single (search + scrollable
  // list) in the standalone centered mode. A class is "active" only when ALL selected images carry it;
  // clicking SETS it on all that lack it (or, if all already have it, removes it from all), in one undo
  // step. The panel stays open (toggle several); the active marks re-read the live source each time.
  private openMultiClass(editor: Editor, locations: ImageLocation[]): void {
    if (this.classPanel) { this.closeClassPanel(); return; }
    const available = this.snippetClasses
      .filter((sc) => !this.settings.disabledSnippetClasses.includes(sc.className))
      .map((sc) => sc.className);
    if (available.length === 0) { new Notice(t("settingsNoSnippets")); return; }

    const lines = new Set(locations.map((l) => l.line));
    // Re-resolve the selected embeds from the LIVE editor by line on every read/write — a toggle
    // rewrites the source, so the open-time `locations[].params` go stale; line numbers stay put
    // (edits never add/remove lines). Used both for the active marks AND the next toggle's write so
    // repeated toggles accumulate against the current document.
    const liveLocations = (): ImageLocation[] =>
      allEmbedsInText(editor.getValue()).filter((e) => lines.has(e.line));
    // The classes ALL selected images share — the centered panel's "applied" set (active marks).
    const sharedClasses = (): string[] => {
      const parsed = liveLocations().map((e) => parseAltText(e.params));
      if (parsed.length === 0) return [];
      return available.filter((cls) => parsed.every((p) => p.classes.includes(cls)));
    };

    const panel = new ClassPanel(available, {
      appliedClasses: sharedClasses,
      onToggle: (className: string) => {
        const allHave = sharedClasses().includes(className);
        this.modifyTransformMulti(editor, liveLocations(), (tr) => {
          const i = tr.classes.indexOf(className);
          if (allHave) { if (i >= 0) tr.classes.splice(i, 1); }   // remove from all
          else if (i < 0) tr.classes.push(className);             // add to those that lack it
        });
      },
      onClose: () => { this.classPanel = null; this.refreshLivePreviewDecorations(); },
    });
    panel.open(null, null, this.multiTitle(locations.length));
    this.classPanel = panel;
  }

  // Apply `modifier` to several images' `{…}` blocks in ONE transaction (one undo step). Each block
  // is parsed, modified and re-serialized independently; the changes are non-overlapping so CM6
  // applies them atomically against the current document. The live-preview StateField rebuilds the
  // affected widgets on the doc change, so all images repaint without manual DOM work.
  private modifyTransformMulti(editor: Editor, locations: ImageLocation[], modifier: (t: ImageTransform) => void): void {
    const changes = locations.map((loc) => {
      const tr = parseAltText(loc.params);
      modifier(tr);
      const params = serializeTransform(tr);
      return {
        from: editor.posToOffset({ line: loc.line, ch: loc.headEnd }),
        to: editor.posToOffset({ line: loc.line, ch: loc.end }),
        insert: params ? `{${params}}` : "",
      };
    });
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    if (cm) {
      writeSource(cm, changes);
    } else {
      // Non-CM6 fallback: apply LAST-to-first so earlier offsets stay valid as text shifts.
      for (const c of changes.slice().reverse()) {
        editor.replaceRange(c.insert, editor.offsetToPos(c.from), editor.offsetToPos(c.to));
      }
    }
  }

  // Page-scope reset (F19): strip the `{…}` transform block from EVERY image in the active note,
  // in ONE undo step. Non-destructive like the single-image reset — only the `{…}` block goes;
  // the embed link and any native `|size` suffix stay. The live-preview StateField rebuilds the
  // widgets on the doc change, so the images repaint to their original state automatically.
  private resetAllImages(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "source") { new Notice(t("resetAllNoEditor")); return; }
    const editor = view.editor;
    const edited = allEmbedsInText(editor.getValue()).filter((e) => e.params !== "");
    if (edited.length === 0) { new Notice(t("resetAllNone")); return; }
    this.modifyTransformMulti(editor, edited, clearTransform);
    new Notice(t("resetAllDone").replace("{n}", String(edited.length)));
  }

  /** Re-parses the embed anchored at a stored source location. */
  private reparseLocation(editor: Editor, location: ImageLocation, source: string): ImageLocation | null {
    if (location.line < 0 || location.line >= editor.lineCount()) return null;
    const line = editor.getLine(location.line);
    if (location.start < 0 || location.start >= line.length) return null;
    const embed = scanEmbed(line.slice(location.start), 0);
    if (!embed || embed.start !== 0) return null;
    const current = this.toImageLocation(location.line, line, location.start, embed);
    return basename(current.filename) === basename(source) ? current : null;
  }

  /** Resolves a normal CodeMirror widget from its exact decoration position. */
  private widgetLocation(cm: EditorView, img: HTMLImageElement): ImageLocation | null {
    const wrapper = img.closest<HTMLElement>(".lie-wrapper");
    const source = getImageFilename(img);
    if (!wrapper?.isConnected || !source) return null;
    try {
      const position = cm.posAtDOM(wrapper);
      const line = cm.state.doc.lineAt(position);
      const locations = this.parseLocationsInRange(cm, line.from, line.to);
      if (!locations) return null;
      const matches = locations.filter((location) =>
        line.from + location.end === position && basename(location.filename) === basename(source)
      );
      return matches.length === 1 ? matches[0]! : null;
    } catch {
      return null;
    }
  }

  /** Returns whether an image belongs to a post-processor render host. */
  private isPostProcessorImage(img: HTMLImageElement): boolean {
    return !img.closest(".lie-caption") && !!img.closest(".markdown-rendered");
  }

  /** Revalidates a cached post-processor address against the current immutable document. */
  private cachedPostProcessorLocation(editor: Editor, img: HTMLImageElement): ImageLocation | null {
    const cached = this.postProcessorLocations.get(img);
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    if (!cached || !cm) return null;

    const exact = (): ImageLocation | null => {
      const location = this.reparseLocation(editor, cached.location, cached.location.filename);
      const source = getImageFilename(img);
      if (!location || (source && basename(location.filename) !== basename(source))) return null;
      this.postProcessorLocations.set(img, { doc: cm.state.doc, location });
      return location;
    };

    if (cached.doc === cm.state.doc) {
      const location = exact();
      if (location) return location;
    } else if (!img.isConnected) {
      return exact();
    }

    if (!img.isConnected) return null;
    const block = img.closest<HTMLElement>(POSTPROCESSOR_BLOCK_SELECTOR);
    if (!block) return null;
    this.pairLivePreviewBlock(cm, block);
    const refreshed = this.postProcessorLocations.get(img);
    if (!refreshed || refreshed.doc !== cm.state.doc) return null;
    return this.reparseLocation(editor, refreshed.location, refreshed.location.filename);
  }

  /** Resolves an image without document-wide or basename-first fallback. */
  private locateImage(editor: Editor, img: HTMLImageElement): ImageLocation | null {
    if (this.postProcessorLocations.has(img)) return this.cachedPostProcessorLocation(editor, img);
    if (this.isPostProcessorImage(img)) return null;
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    return cm ? this.widgetLocation(cm, img) : null;
  }

  /** Resolves one specific image and revalidates a captured fallback when detached. */
  private locateSpecificImage(
    img: HTMLImageElement,
    opts: { notify?: boolean; fallback?: ImageLocation } = {}
  ): { editor: Editor; location: ImageLocation } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      if (opts.notify) new Notice("Open the note in editing mode to edit images.");
      return null;
    }
    const editor = view.editor;
    let location = this.locateImage(editor, img);
    const postProcessor = this.postProcessorLocations.has(img) || this.isPostProcessorImage(img);
    if (!location && opts.fallback && !postProcessor) {
      location = this.reparseLocation(editor, opts.fallback, opts.fallback.filename);
    }
    if (!location) {
      if (opts.notify) new Notice("Couldn't locate this image in the note source.");
      return null;
    }
    return { editor, location };
  }

  /** Resolves the active image for a single-image action. */
  private locateActiveImage(opts: { notify?: boolean; fallback?: ImageLocation } = {}):
    { editor: Editor; location: ImageLocation } | null {
    if (!this.activeImage) return null;
    return this.locateSpecificImage(this.activeImage, opts);
  }

  private resolveLocation(): { editor: Editor; location: ImageLocation } | null {
    return this.locateActiveImage({ notify: true });
  }

  private modifyTransform(
    modifier: (t: ImageTransform) => void,
    fallback?: ImageLocation,
    target = this.activeImage
  ): void {
    if (!target) return;
    const resolved = this.locateSpecificImage(target, { notify: true, fallback });
    if (!resolved) return;
    const { editor, location } = resolved;
    // Seed with the native pipe/alt size folded in so an edit that doesn't touch size (rotate,
    // flip, filter…) PRESERVES a raw `![[img|160]]`'s size; writeTransform then normalizes it into
    // the {…} block and strips the pipe (size lives in the block — F6/T2, Bug 94).
    const transform = this.locationTransform(location);
    modifier(transform);
    if (!this.writeTransform(editor, location, transform, target)) return;
    this.applyLivePreview(location, transform, target);
  }

  // The transform a located embed currently renders with: its {…} block PLUS the native
  // wikilink/markdown size folded in (the explicit block always wins). The single source for
  // reading an image's current state on edit/display, so a raw `![[img|160]]` is seen at its real
  // size (Bug 94).
  private locationTransform(location: ImageLocation): ImageTransform {
    const t = parseAltText(location.params);
    applyNativeSize(t, splitTail(location.alt).size);
    return t;
  }

  // Fold the native size of a READING-VIEW <img> into the transform (the {…} block always wins).
  // Sources, in priority order, so EVERY pipe variant is covered (Bug 94): the RAW source alias when
  // known (`rawAlt` — authoritative: `300`, `300x200`, `auto`-forms, caption+size, legacy `|size`),
  // the rendered `img.alt` token (Obsidian keeps the alias for caption embeds), and finally the
  // `width`/`height` ATTRIBUTES Obsidian sets for a PURE native size — where it strips the size from
  // the alt (notably the markdown `![alt|300](p)` form). Each `applyNativeSize` only fills a still-
  // empty axis, so the order is a true priority chain.
  private foldNativeSize(t: ImageTransform, img: HTMLImageElement, rawAlt?: string): void {
    applyNativeSize(t, splitTail(rawAlt ?? img.alt).size);
    const aw = img.getAttribute("width");
    const ah = img.getAttribute("height");
    if (aw || ah) {
      const dim = (v: string | null): string => (v && /^\d+$/.test(v) ? v : "auto");
      applyNativeSize(t, `${dim(aw)}x${dim(ah)}`);
    }
  }

  private applyLivePreview(
    location: ImageLocation,
    transform: ImageTransform,
    preferred?: HTMLImageElement | null
  ): void {
    const apply = () => {
      const img = preferred !== undefined
        ? preferred?.isConnected
          ? preferred
          : this.findRenderedImage(location)
        : this.activeImage?.isConnected
          ? this.activeImage
          : this.findRenderedImage(location);
      if (!img) return;
      this.activeImage = img;
      applyTransformToImage(img, transform);
    };
    apply();
    window.requestAnimationFrame(apply);
  }

  private sameLocation(a: ImageLocation, b: ImageLocation): boolean {
    return a.line === b.line && a.start === b.start && a.headEnd === b.headEnd &&
      a.end === b.end && basename(a.filename) === basename(b.filename);
  }

  /** Finds only a uniquely addressable rendered image for a source location. */
  private findRenderedImage(location: ImageLocation): HTMLImageElement | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const root = this.adapterRoot(view);
    if (!root?.isConnected) return null;

    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    const candidates = new Set<HTMLImageElement>();
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
      if (!img.isConnected || !root.contains(img)) continue;
      const entry = this.postProcessorLocations.get(img);
      if (entry && (!cm || entry.doc === cm.state.doc) && this.sameLocation(entry.location, location)) {
        candidates.add(img);
      }
    }
    if (cm) {
      for (const wrapper of Array.from(root.querySelectorAll<HTMLElement>(".lie-wrapper"))) {
        const img = wrapper.querySelector<HTMLImageElement>("img");
        if (
          !img?.isConnected || !root.contains(img) ||
          this.postProcessorLocations.has(img) || this.isPostProcessorImage(img)
        ) continue;
        const current = this.widgetLocation(cm, img);
        if (current && this.sameLocation(current, location)) candidates.add(img);
      }
    }
    if (candidates.size !== 1) return null;
    for (const candidate of candidates) return candidate;
    return null;
  }

  /** Ordered-edit writer: rebuild the whole embed canonically (form per setting, native size
   *  folded, caption kept); source form/path kept when no token. One write, one undo step. */
  private writeTransform(
    editor: Editor,
    location: ImageLocation,
    transform: ImageTransform,
    image?: HTMLImageElement | null
  ): boolean {
    if (image) {
      const current = this.locateSpecificImage(image, { fallback: location });
      if (!current || current.editor !== editor) return false;
      location = current.location;
    }
    const params = serializeTransform(transform);
    // An ordered edit that changes nothing writes nothing (F0) — no redundant undo step.
    if (params === serializeTransform(this.locationTransform(location))) return true;
    const { caption } = splitTail(location.alt);
    const desired = desiredFormat(this.useMarkdownLinks());
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    const token = this.canonicalPathToken(location.filename, sourcePath, desired);
    const target = canonicalTarget(location.isWikiLink ? "wiki" : "md", location.filename, desired, caption, token);
    const embed = buildEmbed(target.format, {
      caption, path: target.path, size: "", block: params ? `{${params}}` : "",
      escapePipe: location.inTable,
    });
    const from = editor.posToOffset({ line: location.line, ch: location.start });
    const to = editor.posToOffset({ line: location.line, ch: location.end });
    this.writeToSource(editor, from, to, embed);
    return true;
  }

  // Funnel a document edit through the shared isolateHistory writer (one undo step per
  // edit, scroll pinned). The cursor is moved onto the edited image's line (`from`) — a
  // single-image toolbar edit places the caret on its image, like Obsidian's own embeds,
  // and crucially gives undo a sane startSelection so cmd+Z doesn't scroll to the top
  // (D11 — revised: the cursor follows the edit, but only on edit, never on hover). CM6
  // is always present in the editing modes; the editor.replaceRange fallback only guards
  // a hypothetical non-CM6 editor.
  // No-op guard: skip the dispatch when the new block is byte-identical to what's already
  // there, so an UNCHANGED accept/leave (open size/filter, change nothing, then ✓/click-away)
  // adds no redundant undo step — matching crop's dirty-guarded commit (one undo step per
  // ACTUAL edit, never a self-replacing one).
  private writeToSource(editor: Editor, from: number, to: number, insert: string): void {
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    if (cm) {
      if (cm.state.doc.sliceString(from, to) === insert) return;
      writeSource(cm, { from, to, insert }, from);
      return;
    }
    const fromPos = editor.offsetToPos(from);
    const toPos = editor.offsetToPos(to);
    if (editor.getRange(fromPos, toPos) === insert) return;
    editor.replaceRange(insert, fromPos, toPos);
  }

  private rotateCw(): void {
    this.modifyTransform((tr) => setRotation(tr, (getRotation(tr) + 90) % 360));
  }
  private rotateCcw(): void {
    this.modifyTransform((tr) => setRotation(tr, (getRotation(tr) - 90 + 360) % 360));
  }
  private flipH(): void { this.modifyTransform((tr) => toggleFlipH(tr)); }
  private flipV(): void { this.modifyTransform((tr) => toggleFlipV(tr)); }

  private applyLayout(layout: Layout): void {
    this.modifyTransform(setLayoutToggle(layout));
  }

  private applyPreset(key: PresetKey): void {
    // Bake the preset to a literal px width (faithful no-plugin fallback, the bare width=N key);
    // NOT setting-reactive — an existing preset image keeps its baked px when the setting changes.
    this.modifyTransform((tr) => setWidthPx(tr, this.settings.presetWidths[key]));
  }

  private applyClass(
    cls: string,
    fallback?: ImageLocation,
    target = this.activeImage
  ): void {
    this.modifyTransform((tr) => {
      const idx = tr.classes.indexOf(cls);
      if (idx >= 0) tr.classes.splice(idx, 1);
      else tr.classes.push(cls);
    }, fallback, target);
  }

  private reset(): void {
    const target = this.activeImage;
    if (!target) return;
    const resolved = this.locateSpecificImage(target, { notify: true });
    if (!resolved) return;
    const { editor, location } = resolved;
    const empty: ImageTransform = { classes: [] };
    if (this.writeTransform(editor, location, empty, target)) {
      applyTransformToImage(target, empty);
    }
  }

  private activeToolbarEl(): HTMLElement | null {
    if (this.toolbar.isVisible()) return activeDocument.querySelector<HTMLElement>(".lie-toolbar-floating");
    const wrapperToolbar = this.activeImage
      ?.closest(".lie-wrapper")
      ?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null;
    if (wrapperToolbar) return wrapperToolbar;
    return this.activeImage
      ? editorToolbarOwner(this.activeImage)?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null
      : null;
  }

  /** The exact static inset toolbar whose presentation must stay stable for a panel session. */
  private staticSessionToolbar(img: HTMLImageElement): HTMLElement | null {
    return editorToolbarOwner(img)?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null;
  }

  private lockToolbarSession(img: HTMLImageElement): HTMLElement | null {
    const toolbar = this.staticSessionToolbar(img);
    toolbar?.classList.add(TOOLBAR_SESSION_CLASS);
    return toolbar;
  }

  /** Unlock, reflow the static inset node and synchronize the visible toolbar presentation. */
  private finishToolbarSession(
    lockedToolbar: HTMLElement | null,
    opened: HTMLImageElement,
    location: ImageLocation
  ): void {
    lockedToolbar?.classList.remove(TOOLBAR_SESSION_CLASS);
    const sync = () => {
      const img = opened.isConnected ? opened : this.findRenderedImage(location);
      if (!img?.isConnected) return;
      const toolbar = this.staticSessionToolbar(img);
      if (!toolbar?.isConnected) return;
      if (toolbar.classList.contains(TOOLBAR_SESSION_CLASS)) return;
      reflowToolbar(toolbar);
      const owner = editorToolbarOwner(img);
      if (!owner) return;
      const above = owner.classList.contains(TOOLBAR_ABOVE_CLASS);
      const controllerImage = this.toolbar.getActiveImage();
      if ((above && controllerImage !== img) || (!above && controllerImage === img)) {
        this.onImageSelected(img);
      }
      if (owner.matches(":hover") && owner.classList.contains(TOOLBAR_ABOVE_CLASS)
        && this.toolbar.getActiveImage() === img) {
        this.hoverShown = true;
        this.bindFloatRegion(owner);
      }
    };
    sync();
    window.requestAnimationFrame(sync);
  }

  private closeSubmenu(persist = true): void {
    // The size submenu owns an AnchoredSubmenu directly: map the leave/unload flag to the exit
    // reason (the ✗/Esc DISCARD path is internal to the host). persist → commit, unload → silent.
    this.submenu?.close(persist ? "commit" : "silent");
  }

  private customSize(): void {
    if (this.submenu) { this.closeSubmenu(); return; }
    const resolved = this.locateActiveImage();
    if (!resolved) return;
    const { location } = resolved;

    // Native pipe/alt size folded in, so a raw `![[img|160]]` opens showing 160 (Bug 94).
    const current = this.locationTransform(location);
    const img = this.activeImage!;
    const state: SizeState = { width: current.width ?? null, height: current.height ?? null };
    const toolbarEl = this.activeToolbarEl();
    const lockedToolbar = this.lockToolbarSession(img);

    // Live preview by RE-RENDERING with the new size (so clearing a field / "Original"
    // falls back to the intrinsic default rather than collapsing the box — Bug 42).
    const preview = (s: SizeState): void => {
      const tr = this.locationTransform(location);
      tr.width = s.width ?? undefined;
      tr.height = s.height ?? undefined;
      applyTransformToImage(this.liveTarget(img), tr);
    };
    const sizeBody = buildSizeBody({ width: current.width, height: current.height }, preview, state, this.settings.presetWidths);

    const submenu = new AnchoredSubmenu();
    submenu.open({
      body: sizeBody.body,
      placement: "under-toolbar",
      anchor: toolbarEl ?? img,
      toolbar: toolbarEl,
      title: t("customSize"),
      hoverRegion: img.closest<HTMLElement>(".lie-wrapper") ?? editorToolbarOwner(img) ?? undefined,
      onReset: () => sizeBody.reset(),
      onCommit: () => this.modifyTransform((tr) => { tr.width = state.width ?? undefined; tr.height = state.height ?? undefined; }, location, img),
      // ✗ cancel / Esc (F14): discard — no source write. The source was never touched while open,
      // so re-rendering the live image from its original params restores the pre-open size.
      onCancel: () => applyTransformToImage(this.liveTarget(img), this.locationTransform(location)),
      onClose: () => {
        this.submenu = null;
        this.finishToolbarSession(lockedToolbar, img, location);
        this.refreshLivePreviewDecorations();
      },
    });
    this.submenu = submenu;
  }

  private crop(): void {
    if (this.cropEditor) { this.cropEditor.close(); return; }  // toggle off → persist; onClose clears the ref
    const resolved = this.locateActiveImage();
    if (!resolved) return;
    const { location } = resolved;
    const img = this.activeImage!;
    const toolbarEl = this.activeToolbarEl();
    const lockedToolbar = this.lockToolbarSession(img);

    // Native pipe/alt size folded in, so cropping a raw `![[img|160]]` seeds the crop from its
    // actual displayed width (Bug 94); the commit's modifyTransform then normalizes it.
    const current = this.locationTransform(location);
    const cropEditor = new CropEditor(
      img,
      current,
      // Auto-persist on leave (AD8): a real crop writes its placement; a no-op / Reset leave passes
      // null → un-crop (clear the placement) while keeping the box width set elsewhere. `location`
      // is the fallback when the anchor scrolled out mid-edit (so a duplicate writes the right line).
      (result) => this.modifyTransform((tr) => {
        if (result) {
          tr.transform = result.transform;
          tr.width = result.width;
          tr.aspectRatio = result.aspectRatio; // the cut-frame shape (only when ≠ original)
          tr.height = undefined;               // crop never stores a fixed px height (AD6)
        } else {
          tr.transform = undefined;
          tr.aspectRatio = undefined;
          tr.height = undefined;
        }
      }, location, img),
      () => {
        this.cropEditor = null;
        this.finishToolbarSession(lockedToolbar, img, location);
        this.refreshLivePreviewDecorations();
      }
    );
    // Set the ref BEFORE open(): if open() can't find the 3-layer structure it self-closes
    // synchronously (calling onClosed → nulls the ref), and a post-open assignment would otherwise
    // restore a dead editor and jam the crop toggle + the dismiss guards.
    this.cropEditor = cropEditor;
    cropEditor.open(toolbarEl, img);
  }

  private closeCrop(persist = true): void {
    this.cropEditor?.close(persist);
  }

  private toggleFilters(): void {
    if (this.filterPanel) { this.closeFilterPanel(); return; }
    const resolved = this.locateActiveImage();
    if (!resolved) return;
    const { location } = resolved;

    const current = this.locationTransform(location);
    const originalFilter = getFilter(current);
    const img = this.activeImage!;
    const toolbarEl = this.activeToolbarEl();
    const lockedToolbar = this.lockToolbarSession(img);

    const panel = new FilterPanel(img, originalFilter, {
      onPreview: (filter: FilterData) => applyFilterPreview(this.liveTarget(img), filter),
      onCommit: (filter: FilterData) => this.modifyTransform((tr) => setFilter(tr, Object.keys(filter).length ? filter : undefined), location, img),
      // ✗ cancel / Esc (F14): discard — no source write. Re-render from the untouched source to
      // restore the pre-open filter (and any other transform the live preview painted over).
      onCancel: () => applyTransformToImage(this.liveTarget(img), this.locationTransform(location)),
      onClose: () => {
        this.filterPanel = null;
        this.finishToolbarSession(lockedToolbar, img, location);
        this.refreshLivePreviewDecorations();
      },
    });
    panel.open(img, toolbarEl);
    this.filterPanel = panel;
  }

  // The live image the preview should paint: the still-connected one, or re-acquired.
  private liveTarget(opened: HTMLImageElement): HTMLImageElement {
    if (opened.isConnected) return opened;
    if (this.activeImage?.isConnected) return this.activeImage;
    return opened;
  }

  private closeFilterPanel(persist = true): void {
    this.filterPanel?.close(persist);
  }

  // Open the CSS-classes sub-panel (Bug 88) for the active image, through the SHARED AnchoredSubmenu
  // host — docked beside the image exactly like the filter panel (toolbar-top anchor, pane-bound
  // flip, greyed toolbar, hover region). Toggle: open while one is up closes it. Each row toggles
  // the class with the existing immediate write (`applyClass`); the panel re-reads the source so its
  // active marks track the live state. Disabled snippet classes are filtered out (unchanged).
  private addClass(): void {
    if (this.classPanel) { this.closeClassPanel(); return; }
    if (!this.activeImage) return;
    const availableClasses = this.snippetClasses
      .filter((sc) => !this.settings.disabledSnippetClasses.includes(sc.className))
      .map((sc) => sc.className);
    if (availableClasses.length === 0) {
      new Notice(t("settingsNoSnippets"));
      return;
    }

    const resolved = this.locateActiveImage();
    if (!resolved) return;
    const img = this.activeImage;
    const toolbarEl = this.activeToolbarEl();
    const lockedToolbar = this.lockToolbarSession(img);

    const panel = new ClassPanel(availableClasses, {
      // Read the applied classes FRESHLY from source each refresh so the active marks track the
      // live document after every toggle (the toggle is an immediate write).
      appliedClasses: () => {
        const loc = this.locateSpecificImage(img);
        return loc ? parseAltText(loc.location.params).classes : [];
      },
      onToggle: (className: string) => this.applyClass(className, resolved.location, img),
      onClose: () => {
        this.classPanel = null;
        this.finishToolbarSession(lockedToolbar, img, resolved.location);
        this.refreshLivePreviewDecorations();
      },
    });
    panel.open(img, toolbarEl);
    this.classPanel = panel;
  }

  private closeClassPanel(persist = true): void {
    this.classPanel?.close(persist);
  }

  private async exportImage(): Promise<void> {
    const resolved = this.locateActiveImage();
    if (!resolved) return;
    const { location } = resolved;

    const transform = parseAltText(location.params);
    try {
      const buffer = await renderTransformedImage(this.activeImage!, transform);
      let linkpath = stripLinkSubpath(location.filename);
      try { linkpath = decodeURIComponent(linkpath); } catch { /* keep the raw link */ }
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

  // --- Replace image / Replace all (Feature 3) ----------------------------------------------------
  // Swap the underlying image FILE of an embed for another, non-destructively: the markdown source is
  // rewritten to point at the chosen file while the trailing {…} transform block is kept (the edits
  // survive — the user can Reset). The original image file is never touched. The right occurrence is
  // resolved by DOM position (locateActiveImage / the same path crop/export use), NOT a basename scan
  // (Bug 33). The link form (wikilink vs markdown) follows Obsidian's central "Use [[Wikilinks]]".

  // Whether the vault is configured for markdown (vs wiki) links right now.
  private useMarkdownLinks(): boolean {
    return !!(this.app.vault as unknown as { getConfig?: (k: string) => unknown }).getConfig?.("useMarkdownLinks");
  }

  /** Link token for `file` in the desired form via Obsidian's generator (encoding and
   *  relative-vs-shortest follow the vault settings); the vault-relative path when the
   *  generator's output does not parse (T12). */
  private replacementPathToken(file: TFile, desired: LinkFormat): string {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    try {
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath); // never an alias arg (Lesson 5)
      return pathFromGeneratedLink(link, desired) ?? file.path;
    } catch {
      return file.path;
    }
  }

  // "Replace image" (single, F19-style image-specific): pick a vault image, rewrite THIS embed's
  // target to it, keeping the {…} block. One undo step. The rewrite goes through the pure logic
  // (`replaceEmbedTarget`) so it carries the block/native-size exactly; we then write back the single
  // embed slice for that line (start→end) via the shared isolated writer.
  private replaceImage(): void {
    const img = this.activeImage;
    if (!img) return;
    const resolved = this.locateSpecificImage(img, { notify: true });
    if (!resolved) return;
    const initial = resolved.location;
    this.pickImage((file) => {
      const current = this.locateSpecificImage(img, { notify: true, fallback: initial });
      if (!current) return;
      const { editor, location } = current;
      const desired = desiredFormat(this.useMarkdownLinks());
      const token = this.replacementPathToken(file, desired);
      const rewritten = replaceEmbedTarget(editor.getValue(), location, token, desired === "wiki");
      const origLine = editor.getLine(location.line);
      const newLine = rewritten.split("\n")[location.line] ?? "";
      // The embed slice grew/shrank by the path-length delta; its NEW end = old end + that delta.
      const newEnd = location.end + (newLine.length - origLine.length);
      const insert = newLine.slice(location.start, newEnd);
      const from = editor.posToOffset({ line: location.line, ch: location.start });
      const to = editor.posToOffset({ line: location.line, ch: location.end });
      this.writeToSource(editor, from, to, insert);
      new Notice(t("replaceDone"));
    });
  }

  // "Replace all" (every occurrence of the SAME currently-targeted source in the active note): a
  // find-and-replace of that one source, each occurrence keeping its own {…} block. One undo step.
  private replaceAllImages(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "source") { new Notice(t("resetAllNoEditor")); return; }
    const editor = view.editor;
    const resolved = this.locateActiveImage({ notify: true });
    if (!resolved) return;
    const targetBasename = basename(resolved.location.filename);
    this.pickImage((file) => {
      const desired = desiredFormat(this.useMarkdownLinks());
      const token = this.replacementPathToken(file, desired);
      const changes = planReplaceAll(
        allEmbedsInText(editor.getValue()),
        targetBasename,
        token,
        desired === "wiki",
        basename,
        (line, ch) => editor.posToOffset({ line, ch })
      );
      if (changes.length === 0) return;
      const cm = (editor as unknown as { cm?: EditorView }).cm;
      if (cm) writeSource(cm, changes);
      else for (const c of changes.slice().reverse()) editor.replaceRange(c.insert, editor.offsetToPos(c.from), editor.offsetToPos(c.to));
      new Notice(t("replaceAllDone").replace("{n}", String(changes.length)));
    });
  }

  // Open the vault image picker; run `then` with the chosen file (or no-op on cancel).
  private pickImage(then: (file: TFile) => void): void {
    new ImagePickerModal(this.app, (file) => { if (file) then(file); }).open();
  }

  private hasTransforms(t: ImageTransform): boolean {
    return !!(t.layout || t.rotate || t.flipH || t.flipV || t.transform || t.filter ||
      t.width || t.height || t.aspectRatio ||
      (t.box && Object.keys(t.box).length) || t.classes.length);
  }
}
