import { Plugin, MarkdownView, MarkdownPostProcessorContext, Notice, Editor, TFile, addIcon } from "obsidian";
import {
  ImageTransform, Layout, FilterData, parseAltText, serializeTransform,
  getRotation, setRotation, toggleFlipH, toggleFlipV, getFilter, setFilter,
  setWidthPx, applyNativeSize, PresetKey,
} from "./transforms";
import { buildLayers as applyTransformToImage, applyFilterPreview, BOX_CLASS } from "./render-core";
import { ImageToolbar, ToolbarItem, ToolbarButton, ToolbarGroup } from "./toolbar";
import { BRAND_ICON_ID, BRAND_ICON_SVG } from "./brand-icon";
import { LAYOUTS, LAYOUT_ICON_ID, registerLayoutIcons, currentLayout } from "./layout-icons";
import { findImageInSource, findImageInText, findImageInLine, firstEmbedInLine, allEmbedsInText, spansOverlappingRanges, getImageFilename, basename, ImageLocation } from "./image-resolver";
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
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setLocale, detectLocale, t } from "./i18n";
import { convertEmbedLine, desiredFormat, splitTail, buildEmbed, parseEmbedLine, isTableRow, LinkFormat } from "./link-format";
import { replaceEmbedTarget, planReplaceAll } from "./replace-logic";
import { ImagePickerModal } from "./replace-picker";
import { writeSource } from "./source-writer";
import { clickDismissesToolbar, isEngaged } from "./toolbar-region-logic";
import { ensureEditingToolbarButtons } from "./editing-toolbar-integration";

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

    this.registerEditorExtension(
      Prec.highest(
        createLivePreviewExtension(
          this.app,
          () => this.app.workspace.getActiveFile()?.path ?? "",
          (img) => this.toolbarItemsForImage(img),
          () => this.settings.showCaptions,
          () => this.settings.defaultRevealState,
          () => this.settings.renderImagesInCodeBlocks,
          () => this.engagedImagePos()
        )
      )
    );

    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleNormalize()));

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
    // The live-preview CM6 widget owns the editor (AD5 overlay); never box the native
    // (CSS-suppressed) embed images inside the editor.
    if (el.closest(".cm-editor")) return;
    const sourcePath = ctx.sourcePath || this.app.workspace.getActiveFile()?.path || "";
    for (const embed of Array.from(el.querySelectorAll(".internal-embed"))) {
      this.processBlock(embed as HTMLElement, () => embed.querySelector("img"), sourcePath);
    }
    for (const img of Array.from(el.querySelectorAll("img"))) {
      if (img.closest(".internal-embed")) continue;
      this.processBlock(img, () => img, sourcePath);
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
      // Fold the native wikilink/markdown size (e.g. `![[img|160]]`) into the {…} transform on READ
      // so a raw native size still renders at its size; the explicit {…} block always wins (Bug 94).
      // Re-derived per call — idempotent.
      const merged: ImageTransform = transform
        ? { ...transform, classes: [...transform.classes] }
        : { classes: [] };
      this.foldNativeSize(merged, img);
      if (this.hasTransforms(merged)) applyTransformToImage(img, merged);
      else this.clearStaleTransform(img);
      this.applyReadingCaption(img, sourcePath);
      // Shrink-wrap the reading-view host that DIRECTLY holds our box (caption/column sizing). We set
      // the `.lie-embed` class on it ourselves — a direct selector, not `:has(> .lie-image-area)`
      // (Decision 28). LP doesn't need it (its box sits under `.lie-box`, which shrink-wraps itself).
      img.closest(`.${BOX_CLASS}`)?.parentElement?.classList.add("lie-embed");
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
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath); // never an alias arg (Lesson 5)
      // generateMarkdownLink writes an embed for any embeddable (image) file — parse it with the
      // ONE grammar scanner (Bug 120) rather than a bespoke regex, so a path with parens/spaces
      // (e.g. "Screenshot (1).png") comes back intact instead of truncated at the first `)`.
      const e = parseEmbedLine(link);
      return e && e.format === desired ? e.path : null;
    } catch {
      return null;
    }
  }

  // Fold a Markdown native size ![alt|513](path) into the portable block (F6), riding the
  // ONE grammar round-trip (parseEmbedLine → buildEmbed) — no second regex or escape
  // knowledge here. A wikilink's native size stays in place by design (F5).
  private normalizeNativeSizes(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) return;

    const cursorLine = editor.getCursor().line;
    for (let i = 0; i < editor.lineCount(); i++) {
      if (i === cursorLine) continue;
      const line = editor.getLine(i);
      const e = parseEmbedLine(line);
      if (!e || e.format !== "md" || e.size === "") continue;
      const replacement = buildEmbed("md", {
        caption: e.caption, path: e.path, size: e.size, block: e.block,
        escapePipe: isTableRow(line),
      });
      const newLine = line.slice(0, e.start) + replacement + line.slice(e.end);
      if (newLine !== line) editor.setLine(i, newLine);
    }
  }

  // Reading-view render path only (Obsidian caches embeds). The LP CM6 widget owns its
  // own `.lie-wrapper` images — reconcile must NOT touch them (no double render, Lesson 8).
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

      // Track each basename's occurrence in DOM order (= source order in reading view) so a
      // file embedded more than once resolves POSITION-EXACT (F2/AB3): the n-th rendered embed
      // maps to the n-th source embed, not merely the first basename match. Skipped images are
      // still counted so later duplicates stay aligned.
      const seen = new Map<string, number>();
      for (const el of Array.from(container.querySelectorAll("img"))) {
        const img = el;
        const file = getImageFilename(img);
        if (!file) continue;
        const occurrence = seen.get(file) ?? 0;
        seen.set(file, occurrence + 1);
        // The LP overlay owns its own images; the editor's native embed images are
        // CSS-suppressed and must be left untouched (AD5 — no double render). An image being
        // CROPPED in place (`.lie-cropping` on its area/host) must also be skipped — a re-render
        // (buildLayers → resetLieState) mid-session would wipe the editor's transient geometry.
        if (img.closest(".lie-wrapper, .cm-editor, .lie-cropping")) continue;
        const loc = findImageInText(source, file, occurrence);
        const transform = loc ? parseAltText(loc.params) : { classes: [] };
        // Fold the native wikilink/markdown size into the transform on READ (the {…} block wins);
        // a raw `![[img|160]]` with no block still renders at its size (Bug 94). The raw source
        // alias (loc.alt) is authoritative for every pipe variant.
        this.foldNativeSize(transform, img, loc?.alt);
        if (this.hasTransforms(transform)) applyTransformToImage(img, transform);
        else this.clearStaleTransform(img);
        this.applyReadingCaption(img, sourcePath);
      }
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
        return /^\s*\{[^}]*\}/.test(text) ? (node as Text) : null;
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

    // HOVER path for images that can't host the in-chrome toolbar (`.lie-float`: too-short block
    // images flagged by the reflow, and inline icons). They use the SAME toolbar, shown floating on the
    // body (outside `contain: paint`). The delegated `mouseover` OPENS it (entering a `.lie-float`
    // image); DISMISS is no longer immediate-on-leave — the floating bar now rides the SAME
    // `bindRegionHover` active region as the panels (D6, `bindFloatRegion`): image + bar are ONE region
    // with the 160ms travel-grace, so moving image→bar across the gap above the image keeps it (the
    // floating bar sits ABOVE the image with a gap, so an immediate-on-leave dismiss made it unreachable
    // for a tiny inline icon). The region governs the dismiss when the whole region is truly left.
    this.registerDomEvent(activeDocument, "mouseover", (evt: MouseEvent) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(".lie-toolbar, .lie-group-popup, .lie-class-panel, .lie-submenu, .lie-filter-panel, .lie-cropping")) return;
      const floatWrap = target.closest<HTMLElement>(".markdown-source-view .lie-wrapper.lie-float");
      if (floatWrap) {
        const img = floatWrap.querySelector("img");
        if (img && this.settings.showToolbar && this.toolbar.getActiveImage() !== img) {
          this.onImageSelected(img);
          this.hoverShown = true;
          this.bindFloatRegion(floatWrap);
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
    if (img !== this.activeImage) {
      this.closeFilterPanel();
      this.closeClassPanel();
      this.closeSubmenu();
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

  // Line-accurate {location, rendered <img>} pairs for the selected embeds — used to live-preview a
  // multi panel on EACH image. The DOM image is found by its CM6 source position (`posAtDOM`), so a
  // file embedded more than once previews on the RIGHT element; basename lookup is the fallback.
  private renderedPairs(locations: ImageLocation[]): { loc: ImageLocation; img: HTMLImageElement }[] {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = (view?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
    const root = view?.contentEl.querySelector(".markdown-source-view");
    const byLine = new Map<number, HTMLImageElement>();
    if (cm && root) {
      for (const wrapper of Array.from(root.querySelectorAll<HTMLElement>(".lie-wrapper"))) {
        const img = wrapper.querySelector("img");
        if (!img) continue;
        try { byLine.set(cm.state.doc.lineAt(cm.posAtDOM(wrapper)).number - 1, img); } catch { /* skip */ }
      }
    }
    const out: { loc: ImageLocation; img: HTMLImageElement }[] = [];
    for (const loc of locations) {
      const img = byLine.get(loc.line) ?? this.findRenderedImage(loc);
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

  // Resolve the active image's source location (Bug 56). Prefer the rendered image's ACTUAL
  // line, read from its DOM position via CM6 `posAtDOM` (the same line-accurate path the resize
  // handle uses) — so a file embedded more than once resolves to the RIGHT occurrence, not the
  // first basename match. Falls back to the basename scan only when there is no live editor
  // view (e.g. reading view, where `cm` is absent).
  private locateImage(editor: Editor, img: HTMLImageElement): ImageLocation | null {
    const src = getImageFilename(img);
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    const wrapper = img.closest<HTMLElement>(".lie-wrapper") ?? img;
    if (src && cm && wrapper.isConnected) {
      try {
        const lineNo = editor.offsetToPos(cm.posAtDOM(wrapper)).line;
        const loc = findImageInLine(editor.getLine(lineNo), lineNo, src);
        if (loc) return loc;
      } catch { /* fall back to the basename scan */ }
    }
    return findImageInSource(editor, img);
  }

  // The single image-location lookup every toolbar/menu action shares (R0). Prefers the LIVE
  // image's DOM position (line-accurate even after the doc shifts — Bug 56); when the image is
  // DETACHED (a panel whose anchor scrolled out of the CM6 viewport mid-edit), it falls back to
  // the location captured at panel-open — NOT a basename scan, which would hit the wrong
  // occurrence of a duplicated image. `notify` shows the user-facing Notices (resolveLocation);
  // the panel openers stay silent.
  private locateActiveImage(opts: { notify?: boolean; fallback?: ImageLocation } = {}):
    { editor: Editor; location: ImageLocation } | null {
    if (!this.activeImage) return null;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      if (opts.notify) new Notice("Open the note in editing mode to edit images.");
      return null;
    }
    const editor = view.editor;
    let location: ImageLocation | null = null;
    if (this.activeImage.isConnected) location = this.locateImage(editor, this.activeImage);
    else if (opts.fallback) location = opts.fallback;
    else location = this.locateImage(editor, this.activeImage);
    if (!location) {
      if (opts.notify) new Notice("Couldn't locate this image in the note source.");
      return null;
    }
    return { editor, location };
  }

  private resolveLocation(): { editor: Editor; location: ImageLocation } | null {
    return this.locateActiveImage({ notify: true });
  }

  private modifyTransform(modifier: (t: ImageTransform) => void, fallback?: ImageLocation): void {
    const resolved = this.locateActiveImage({ notify: true, fallback });
    if (!resolved) return;
    const { editor, location } = resolved;
    // Seed with the native pipe/alt size folded in so an edit that doesn't touch size (rotate,
    // flip, filter…) PRESERVES a raw `![[img|160]]`'s size; writeTransform then normalizes it into
    // the {…} block and strips the pipe (size lives in the block — F6/T2, Bug 94).
    const transform = this.locationTransform(location);
    modifier(transform);
    this.writeTransform(editor, location, transform);
    this.applyLivePreview(location, transform);
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
    return Array.from(root.querySelectorAll("img")).find((img) => {
      const src = decodeURIComponent(img.getAttribute("src") ?? "");
      return src.includes(base);
    }) ?? null;
  }

  private writeTransform(editor: Editor, location: ImageLocation, transform: ImageTransform): void {
    const params = serializeTransform(transform);
    const { size, caption } = splitTail(location.alt);
    if (size) {
      // Normalize on edit (Bug 94): the embed carries a native pipe/alt size — rebuild the WHOLE
      // embed in canonical form so the size moves into the {…} block (already in `transform`,
      // seeded by locationTransform; empty on reset → size cleared) and is STRIPPED from the link
      // head, keeping the caption. Size lives in the block, never the link (F6/T2).
      const embed = buildEmbed(location.isWikiLink ? "wiki" : "md", {
        caption, path: location.filename, size: "", block: params ? `{${params}}` : "",
        escapePipe: location.inTable,
      });
      const from = editor.posToOffset({ line: location.line, ch: location.start });
      const to = editor.posToOffset({ line: location.line, ch: location.end });
      this.writeToSource(editor, from, to, embed);
      return;
    }
    const block = params ? `{${params}}` : "";
    const from = editor.posToOffset({ line: location.line, ch: location.headEnd });
    const to = editor.posToOffset({ line: location.line, ch: location.end });
    this.writeToSource(editor, from, to, block);
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
    if (this.toolbar.isVisible()) return activeDocument.querySelector<HTMLElement>(".lie-toolbar-floating");
    return this.activeImage?.closest(".lie-wrapper")?.querySelector<HTMLElement>(".lie-toolbar-in-image") ?? null;
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
      anchor: this.activeToolbarEl() ?? img,
      toolbar: this.activeToolbarEl(),
      title: t("customSize"),
      hoverRegion: img.closest<HTMLElement>(".lie-wrapper") ?? undefined,
      onReset: () => sizeBody.reset(),
      onCommit: () => this.modifyTransform((tr) => { tr.width = state.width ?? undefined; tr.height = state.height ?? undefined; }, location),
      // ✗ cancel / Esc (F14): discard — no source write. The source was never touched while open,
      // so re-rendering the live image from its original params restores the pre-open size.
      onCancel: () => applyTransformToImage(this.liveTarget(img), this.locationTransform(location)),
      onClose: () => { this.submenu = null; this.refreshLivePreviewDecorations(); },
    });
    this.submenu = submenu;
  }

  private crop(): void {
    if (this.cropEditor) { this.cropEditor.close(); return; }  // toggle off → persist; onClose clears the ref
    const resolved = this.locateActiveImage();
    if (!resolved) return;
    const { location } = resolved;

    // Native pipe/alt size folded in, so cropping a raw `![[img|160]]` seeds the crop from its
    // actual displayed width (Bug 94); the commit's modifyTransform then normalizes it.
    const current = this.locationTransform(location);
    const cropEditor = new CropEditor(
      this.activeImage!,
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
      }, location),
      () => { this.cropEditor = null; this.refreshLivePreviewDecorations(); }
    );
    // Set the ref BEFORE open(): if open() can't find the 3-layer structure it self-closes
    // synchronously (calling onClosed → nulls the ref), and a post-open assignment would otherwise
    // restore a dead editor and jam the crop toggle + the dismiss guards.
    this.cropEditor = cropEditor;
    cropEditor.open(this.activeToolbarEl(), this.activeImage);
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

    const panel = new FilterPanel(img, originalFilter, {
      onPreview: (filter: FilterData) => applyFilterPreview(this.liveTarget(img), filter),
      onCommit: (filter: FilterData) => this.modifyTransform((tr) => setFilter(tr, Object.keys(filter).length ? filter : undefined), location),
      // ✗ cancel / Esc (F14): discard — no source write. Re-render from the untouched source to
      // restore the pre-open filter (and any other transform the live preview painted over).
      onCancel: () => applyTransformToImage(this.liveTarget(img), this.locationTransform(location)),
      onClose: () => { this.filterPanel = null; this.refreshLivePreviewDecorations(); },
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

    const panel = new ClassPanel(availableClasses, {
      // Read the applied classes FRESHLY from source each refresh so the active marks track the
      // live document after every toggle (the toggle is an immediate write).
      appliedClasses: () => {
        const loc = this.locateActiveImage();
        return loc ? parseAltText(loc.location.params).classes : [];
      },
      onToggle: (className: string) => this.applyClass(className),
      onClose: () => { this.classPanel = null; this.refreshLivePreviewDecorations(); },
    });
    panel.open(img, this.activeToolbarEl());
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
      let linkpath = location.filename;
      try { linkpath = decodeURIComponent(location.filename); } catch { /* keep the raw link */ }
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

  // The link token for `file` in the desired form (the wikilink inner text, or the md `(path)`
  // contents), via Obsidian's own generator so encoding/relative-vs-shortest matches the vault's
  // settings. Falls back to the vault-relative path when the generator's shape is unexpected (T12).
  private replacementPathToken(file: TFile, desired: LinkFormat): string {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    try {
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath); // never an alias arg (Lesson 5)
      if (desired === "wiki") {
        const m = link.match(/^!?\[\[([^\]|]+)/);
        if (m?.[1]) return m[1];
      } else {
        const m = link.match(/\]\(([^)]+)\)/);
        if (m?.[1]) return m[1];
      }
    } catch { /* fall through to the vault path */ }
    return file.path;
  }

  // "Replace image" (single, F19-style image-specific): pick a vault image, rewrite THIS embed's
  // target to it, keeping the {…} block. One undo step. The rewrite goes through the pure logic
  // (`replaceEmbedTarget`) so it carries the block/native-size exactly; we then write back the single
  // embed slice for that line (start→end) via the shared isolated writer.
  private replaceImage(): void {
    const resolved = this.locateActiveImage({ notify: true });
    if (!resolved) return;
    const { editor, location } = resolved;
    this.pickImage((file) => {
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
