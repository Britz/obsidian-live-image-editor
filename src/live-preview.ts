import { App, TFile, editorLivePreviewField } from "obsidian";
import { EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import { parseAltText, getWidthPx, getHeightPx, applyNativeSize, ImageTransform } from "./transforms";
import { parseEmbedLine } from "./link-format";
import { lineDecorations, rewriteWidth, reduceReveal, resolveLinkReveal, URL_CLASS, RevealMode } from "./live-preview-logic";
import { estimatedBlockHeight } from "./renderer-logic";
import { captionMarkdown, createCaption, CaptionHandle } from "./caption";
import { buildLayers as applyTransformToImage } from "./render-core";
import { ToolbarItem, buildToolbarElement } from "./toolbar";
import { writeSource } from "./source-writer";

// Force a rebuild when external state (captions / reveal mode settings) changed.
export const refreshDecorations = StateEffect.define<void>();

// `<>` TOGGLE for the per-EMBED `dismissed` state (F8): transiently click the link source away,
// click again to bring it back. The value is the embed's doc position (`e.attrEnd`), so two embeds
// on one line dismiss independently. Transient (not persisted); auto-clears in auto mode.
const toggleReveal = StateEffect.define<number>();
// Whether a line's image is mouse-hovered (line-start pos), so the auto-clear can tell when the
// source is NaturalReveal:false (neither hovered nor the cursor's active line).
const setHover = StateEffect.define<{ line: number; on: boolean }>();

// The `<>` reveal/dismiss ACTION, shared by BOTH toolbar presentations (in-chrome + floating). The
// toolbar item (built in main's `toolbarItemsForImage`) only has the `<img>`; resolve its editor +
// the embed's per-embed key here. `findFromDOM` recovers the EditorView from any node inside it.
export function toggleEmbedReveal(img: HTMLImageElement): void {
  const wrapper = img.closest<HTMLElement>(".lie-wrapper");
  if (!wrapper) return;
  const view = EditorView.findFromDOM(wrapper);
  if (!view) return;
  view.dispatch({ effects: toggleReveal.of(view.posAtDOM(wrapper)) });
}

// `RevealMode` (native / auto / always) is the natural-reveal mode for the link source — defined in
// live-preview-logic.ts (the pure layer) alongside `reduceReveal`. The `<>` dismiss is a SEPARATE
// per-line override on top of it — not a fourth mode.
// "standalone" = a `{…}` embed: an inline widget in the embed's OWN (non-BFC) cm-line, so
// lie-left/right floats escape into `.cm-content` and wrap the following lines (R0). "block"
// = a BARE (block-promoted, no cm-line) embed: a block:true `.cm-content` child, since an
// inline widget would be swallowed there. "inline" = a tiny mid-text icon (lie-inline).
type WidgetMode = "block" | "inline" | "standalone";

// Syntax-highlight an embed's source into spans carrying Obsidian's own CM token
// classes (themed because the widget lives inside `.cm-editor`). Only the embed part
// (`![[…]]` / `![](…)`) — the trailing `{…}` is the NATIVE marked text, never the fake.
function highlightEmbed(embed: string): DocumentFragment {
  const frag = activeDocument.createDocumentFragment();
  const span = (cls: string, text: string): void => {
    if (!text) return;
    const s = activeDocument.createElement("span");
    s.className = cls;
    s.textContent = text;
    frag.appendChild(s);
  };
  const wiki = embed.match(/^(!\[\[)([^\]]*)(\]\])$/);
  if (wiki) {
    span("cm-formatting cm-formatting-link cm-hmd-internal-link", wiki[1] ?? "");
    span("cm-hmd-internal-link cm-link", wiki[2] ?? "");
    span("cm-formatting cm-formatting-link cm-hmd-internal-link", wiki[3] ?? "");
    return frag;
  }
  const md = embed.match(/^(!\[)([^\]]*)(\]\()([^)]*)(\))$/);
  if (md) {
    span("cm-formatting cm-formatting-image cm-image cm-image-marker", md[1] ?? "");
    span("cm-image cm-image-alt-text cm-link", md[2] ?? "");
    span("cm-formatting cm-formatting-link-string cm-string cm-url", md[3] ?? "");
    span("cm-string cm-url", md[4] ?? "");
    span("cm-formatting cm-formatting-link-string cm-string cm-url", md[5] ?? "");
    return frag;
  }
  span("cm-string cm-url", embed);
  return frag;
}

// The "fake" raw-link inline widget — a display-only, UNEDITABLE representation of the
// swallowed embed source (`![[…]]` / `![](…)`), syntax-highlighted (F8/D5). It is the
// ONLY thing standing in for the native embed text; CSS shows it together with the
// native `{…}` per the reveal mode, never alongside a native render of the same source.
class FakeLinkWidget extends WidgetType {
  // `show` = the AB16b decision (resolveLinkReveal.showStandIn) for THIS embed — per-embed, so the one
  // uniform mechanism drives standalone, inline and bare alike. Visibility rides the `lie-show` class
  // (CSS, no `:has`); `show` is in `eq()` so the widget re-renders when the reveal flips.
  constructor(private embed: string, private show: boolean) { super(); }
  eq(o: FakeLinkWidget): boolean { return o.embed === this.embed && o.show === this.show; }
  toDOM(): HTMLElement {
    const el = activeDocument.createElement("span");
    el.className = this.show ? "lie-fake-link lie-show" : "lie-fake-link";
    el.setAttribute("contenteditable", "false");
    el.appendChild(highlightEmbed(this.embed));
    return el;
  }
  ignoreEvent(): boolean { return false; }
}

// The plugin's OWN transformed image (AD5). The line is NOT replaced: Obsidian renders its
// native embed (image CSS-suppressed) and keeps `{…}` as native editable text; this widget
// draws the transformed image + chrome. Rendered INLINE in the cm-line for a `{…}` embed
// ("standalone"), or as a block:true `.cm-content` child for a bare/block-promoted one
// ("block"). `inline` is a mid-text icon.
class EmbedWidget extends WidgetType {
  constructor(
    private app: App,
    private embed: string,
    private params: string,
    private sourcePath: string,
    private getActions: (img: HTMLImageElement) => ToolbarItem[],
    private mode: WidgetMode,
    // Block (bare-embed) mode hosts the stand-in raw link INSIDE this widget (a bare embed is
    // block-promoted, so an inline stand-in decoration is swallowed). `showStandIn`/`reserveStandIn`
    // ride eq() so a reveal flip makes eq() false — but `updateDOM` then mutates ONLY the stand-in's
    // class in place; the image + its ASYNC caption are NOT rebuilt (no flicker / resize-affordance 1c).
    private showStandIn: boolean,
    private reserveStandIn: boolean,
    private showCaptions: boolean,
    private dismissed: boolean
  ) {
    super();
  }

  // eq() includes the reveal state → a flip is "not equal" → CM offers `updateDOM` (below), which
  // updates the stand-in in place when only the reveal changed.
  private sig(): string { return `${this.structuralSig()}|${this.showStandIn}|${this.reserveStandIn}`; }
  // Everything that REQUIRES a full rebuild (all but the reveal). Stored on the wrapper so `updateDOM`
  // can tell a reveal-only flip (mutate in place) from a structural change (recreate).
  private structuralSig(): string {
    return `${this.embed}|${this.params}|${this.sourcePath}|${this.mode}|${this.showCaptions}|${this.dismissed}`;
  }
  eq(other: EmbedWidget): boolean { return this.sig() === other.sig(); }

  // A reveal flip (cursor on/off the line, hover) changes only showStandIn/reserveStandIn. Rather than
  // let CM destroy + rebuild this widget (which would re-create the async caption → flicker / 1c), update
  // the hosted block stand-in's reserve-triad class IN PLACE and keep the DOM. Return false on a real
  // structural change so CM recreates as normal.
  updateDOM(dom: HTMLElement): boolean {
    if (dom.dataset["lieStruct"] !== this.structuralSig()) return false;
    if (this.mode === "block") {
      const fake = dom.querySelector<HTMLElement>(".lie-fake-link-block");
      if (fake) fake.className = this.blockFakeClass();
    }
    return true;
  }

  // The bare stand-in's reserve-triad class (collapse · reserve-invisible `lie-reserve` · reserve-visible
  // `lie-reserve lie-show`). `showStandIn ⇒ reserveStandIn`, so a shown stand-in is reserved+visible.
  private blockFakeClass(): string {
    const cls = ["lie-fake-link", "lie-fake-link-block"];
    if (this.reserveStandIn) cls.push("lie-reserve");
    if (this.showStandIn) cls.push("lie-show");
    return cls.join(" ");
  }

  // The {…} block transform with the native wikilink/markdown size (the alias/alt size token of
  // `this.embed`, e.g. `![[img|160]]`) folded in — the block wins (Bug 94). Used by every render
  // path so a raw native size renders at its size in live preview too.
  private parsedTransform(): ImageTransform {
    const tf = parseAltText(this.params);
    applyNativeSize(tf, parseEmbedLine(this.embed)?.size ?? "");
    return tf;
  }

  get estimatedHeight(): number {
    // Only block:true widgets need an estimate (CM models them out of flow); inline and
    // standalone widgets are measured in the line's natural flow.
    if (this.mode !== "block") return -1;
    const tf = this.parsedTransform();
    const aspect = tf.aspectRatio ? parseFloat(tf.aspectRatio) : null;
    return estimatedBlockHeight({ widthPx: getWidthPx(tf), heightPx: getHeightPx(tf), aspectRatio: aspect });
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = activeDocument.createElement("div");
    // The chrome ASSEMBLY below is UNIFORM across all three modes (one path, no inline fork) — only the
    // wrapper class differs, for CSS placement. `lie-float` just routes to the FLOATING toolbar instead
    // of the in-chrome one (a mid-text icon has no room for the in-chrome bar); standalone/block get the
    // flag dynamically from the reflow when too short, inline carries it by default.
    wrapper.className =
      this.mode === "inline" ? "lie-wrapper lie-wrapper-inline lie-float"
      : this.mode === "standalone" ? "lie-wrapper lie-wrapper-standalone"
      : "lie-wrapper lie-wrapper-block";
    wrapper.setAttribute("contenteditable", "false");
    wrapper.dataset["lieStruct"] = this.structuralSig(); // updateDOM keys reveal-only flips off this
    // The dismiss state rides the wrapper as a plain class, so BOTH toolbar presentations (in-chrome +
    // floating) read it the same way per show (the `<>` `is-off`/label) — the one toolbar, two views. A
    // dismiss flip is in `structuralSig`, so updateDOM recreates and this is set fresh; no updateDOM path.
    wrapper.classList.toggle("lie-dismissed", this.dismissed);

    const file = this.resolveFile();
    if (!file) { wrapper.textContent = this.embed; return wrapper; }

    // AB16b — the BARE embed's stand-in raw link, hosted here (no cm-line to carry an inline stand-in
    // decoration when block-promoted). Its reveal-triad class flips IN PLACE via `updateDOM`, so a reveal
    // change never rebuilds this widget's image/caption (the flicker / 1c regression). Same CSS as before.
    if (this.mode === "block") {
      const fake = activeDocument.createElement("span");
      fake.className = this.blockFakeClass();
      fake.setAttribute("contenteditable", "false");
      fake.appendChild(highlightEmbed(this.embed));
      wrapper.appendChild(fake);
    }

    const area = activeDocument.createElement("div");
    area.className = "lie-box";
    wrapper.appendChild(area);

    const img = activeDocument.createElement("img");
    img.src = this.app.vault.getResourcePath(file);
    img.dataset["lieSrc"] = file.path;
    area.appendChild(img);
    applyTransformToImage(img, this.parsedTransform());

    // Wrap the image (`.lie-image-area`) and the resize handle in a non-clipping host that
    // shrink-wraps the IMAGE only, so the handle's `bottom:0` anchors to the image corner — not the
    // `.lie-box` bottom, which a caption (a sibling flex item, D9) extends below the image. The box
    // stays the caption shrink-host (D9); the host has no `overflow:hidden`, so the corner marker
    // sits centred on the corner (half outside) without being clipped by the image-area's own clip.
    const host = activeDocument.createElement("div");
    host.className = "lie-image-host";
    const imageArea = img.closest<HTMLElement>(".lie-image-area");
    if (imageArea) host.appendChild(imageArea);
    host.appendChild(this.makeResizeCorner(view, wrapper, img));
    area.appendChild(host);
    area.appendChild(this.makeToolbar(img));
    if (this.showCaptions) {
      const caption = createCaption(this.app, captionMarkdown(this.embed), this.sourcePath);
      if (caption) {
        area.classList.add("lie-has-caption");
        area.appendChild(caption.el);
        (wrapper as unknown as { _lieCaption?: CaptionHandle })._lieCaption = caption;
      }
    }

    // Click the image (not a button/handle) → caret onto the EMBED so its own source reveals for
    // editing (F9), UNIFORM for every mode. The resize handle (which fully covers a tiny inline image)
    // is skipped here but handles a plain click itself (below), so clicking any image still reveals.
    area.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".lie-toolbar, .image-resize-corner")) return;
      e.preventDefault();
      this.moveCaretToEmbed(view, wrapper);
    });

    // Track hover of this image so the auto-clear (auto mode) knows when the line is no longer
    // NaturalReveal — `dismissed` resets once the line is neither hovered nor the active line.
    const lineFrom = (): number => view.state.doc.lineAt(view.posAtDOM(wrapper)).from;
    wrapper.addEventListener("mouseenter", () => view.dispatch({ effects: setHover.of({ line: lineFrom(), on: true }) }));
    wrapper.addEventListener("mouseleave", () => view.dispatch({ effects: setHover.of({ line: lineFrom(), on: false }) }));

    return wrapper;
  }

  destroy(dom: HTMLElement): void {
    (dom as unknown as { _lieCaption?: CaptionHandle })._lieCaption?.destroy();
  }

  // The IN-CHROME presentation of the ONE toolbar: the shared `buildToolbarElement` over the SAME item
  // model the floating bar uses (`getActions` === main's `toolbarItemsForImage`, which now carries the
  // `<>` reveal as a normal item). Only the host class differs — `lie-toolbar-in-image` vs `-floating`.
  private makeToolbar(img: HTMLImageElement): HTMLElement {
    const toolbar = buildToolbarElement(this.getActions(img));
    toolbar.classList.add("lie-toolbar-in-image");
    return toolbar;
  }

  private resolveFile(): TFile | null {
    const md = this.embed.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    const wiki = this.embed.match(/^!\[\[([^\]|]+)/);
    const linkpath = decodeURIComponent(md?.[1] ?? wiki?.[1] ?? "");
    if (!linkpath) return null;
    return this.app.metadataCache.getFirstLinkpathDest(linkpath, this.sourcePath);
  }

  // Caret onto the EMBED span (`posAtDOM(wrapper)` = the widget's own doc position), UNIFORM for
  // standalone, block and inline — so clicking any image reveals ITS source for editing (F9), never the
  // line start (which for a mid-text inline image is other text, not the link). No per-mode fork.
  private moveCaretToEmbed(view: EditorView, wrapper: HTMLElement): void {
    view.dispatch({ selection: { anchor: view.posAtDOM(wrapper) } });
    view.focus();
  }

  private makeResizeCorner(view: EditorView, wrapper: HTMLElement, img: HTMLImageElement): HTMLElement {
    const corner = activeDocument.createElement("div");
    corner.className = "image-resize-corner";
    corner.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const box = img.closest<HTMLElement>(".lie-image-area") ?? img;
      const startX = e.clientX;
      const startWidth = box.getBoundingClientRect().width;
      // Any CLICK is an active interaction → move the caret onto the embed (reveal its source) NOW, even
      // when the click goes on to be a resize drag. This is `pointerdown`, so pure hover never reaches it —
      // hover alone moves nothing. Same reveal as clicking the image body; on a tiny inline image the
      // handle IS the whole image, so this is how that click reveals. Uniform, no fork.
      this.moveCaretToEmbed(view, wrapper);
      let dragged = false;
      const widthAt = (ev: PointerEvent) => Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
      const onMove = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - startX) > 2) dragged = true; // ignore sub-pixel jitter, so a plain click isn't a resize
        if (dragged) box.style.width = `${widthAt(ev)}px`;
      };
      const onUp = (ev: PointerEvent) => {
        activeDocument.removeEventListener("pointermove", onMove);
        activeDocument.removeEventListener("pointerup", onUp);
        if (!dragged) return; // a plain click already moved the caret on pointerdown; nothing to resize
        const line = view.state.doc.lineAt(view.posAtDOM(wrapper));
        const replacement = rewriteWidth(line.text, widthAt(ev));
        if (replacement === null) return;
        // Move the cursor onto the resized image's line (D11): the resize handle is reachable on
        // HOVER without first clicking the image, so the caret may sit anywhere (offset 0). Pass
        // `line.from` so writeSource seeds the change's startSelection — otherwise cmd+Z restores
        // the offset-0 selection and scrolls to the document top.
        writeSource(view, { from: line.from, to: line.to, insert: replacement }, line.from);
      };
      activeDocument.addEventListener("pointermove", onMove);
      activeDocument.addEventListener("pointerup", onUp);
    });
    return corner;
  }
}

interface LivePreviewState {
  dismissed: Set<number>;     // EMBED positions (`e.attrEnd`) whose source is `<>`-dismissed (transient)
  hoveredLine: number | null; // line-start of the currently mouse-hovered image (for auto-clear)
  decorations: DecorationSet;
}

// AD10 — embed detection IS Obsidian's OWN logic: the embeds are ENUMERATED from the editor
// `syntaxTree` (the parse), not found by a parallel regex. A markdown embed begins at an `image-marker`
// node (the `!` of `![`), a wikilink embed at a `formatting-embed` node (the `![[`) — CDP-grounded
// against Obsidian's real node names (probe-tree). A code-block `![](…)` carries NEITHER (only
// `hmd-codeblock`), so it is excluded BY CONSTRUCTION — no separate code check. The regex below only
// PARSES the span the parse located (the `![…](…)`/`![[…]]` body + the trailing `{…}` attr list, which
// is plain text after the embed, not a markdown node). Placement (standalone / bare-block / inline) is
// read from the line around the located span ("model from the parse, placement from reality").
const EMBED_AT = /^(!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\])(\{[^}]*\})?/;
interface TreeEmbed { from: number; embedEnd: number; attrEnd: number; embed: string; params: string; mode: WidgetMode; }

function collectEmbeds(state: EditorState, includeCode: boolean): TreeEmbed[] {
  const out: TreeEmbed[] = [];
  const doc = state.doc;
  const seen = new Set<number>();
  const addAt = (from: number): void => {
    if (seen.has(from)) return;
    const line = doc.lineAt(from);
    const m = EMBED_AT.exec(doc.sliceString(from, line.to));
    if (!m) return;
    seen.add(from);
    const embed = m[1] ?? "";
    const embedEnd = from + embed.length;
    const attr = m[2] ?? "";
    const attrEnd = embedEnd + attr.length;
    const standalone = doc.sliceString(line.from, from).trim() === "" && doc.sliceString(attrEnd, line.to).trim() === "";
    const mode: WidgetMode = !standalone ? "inline" : attr ? "standalone" : "block";
    out.push({ from, embedEnd, attrEnd, embed, params: attr ? attr.slice(1, -1) : "", mode });
  };
  let parsed = false;
  try {
    // ensureSyntaxTree forces the parse up to the END of the document (not just the incrementally-parsed
    // / viewport region), so embeds on lower lines are found in the SAME build — otherwise they'd only
    // appear on a later unrelated transaction. Null on timeout (huge doc) → fall back to syntaxTree +
    // the regex scan below (fail-open).
    const full = ensureSyntaxTree(state, doc.length, 100);
    const cursor = (full ?? syntaxTree(state)).cursor();
    do { if (/image-marker|formatting-embed/.test(cursor.name)) addAt(cursor.from); } while (cursor.next());
    parsed = full !== null;
  } catch { /* parse unavailable → regex fail-open below */ }
  // F20 "render images in code blocks" re-includes the code-section embeds the parse excluded; and if
  // the full parse was unavailable (timeout/error), fail OPEN via a regex scan so embeds never vanish.
  if (includeCode || !parsed) {
    const re = /!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/g;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i); re.lastIndex = 0; let mm: RegExpExecArray | null;
      while ((mm = re.exec(line.text)) !== null) addAt(line.from + mm.index);
    }
  }
  out.sort((a, b) => a.from - b.from);
  return out;
}

export function createLivePreviewExtension(
  app: App,
  getSourcePath: () => string,
  getActions: (img: HTMLImageElement) => ToolbarItem[],
  getShowCaptions: () => boolean,
  getRevealMode: () => RevealMode,
  getRenderInCodeBlocks: () => boolean,
  getEngagedPos: () => number | null
) {
  const build = (
    state: import("@codemirror/state").EditorState,
    dismissed: Set<number>,
    hoveredLine: number | null
  ): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const isLivePreview = state.field(editorLivePreviewField);
    const sourcePath = getSourcePath();
    const showCaptions = getShowCaptions();
    const revealMode: RevealMode = getRevealMode();
    const renderInCode = getRenderInCodeBlocks(); // F20 — the lone override of the AD10 code-block exclusion
    const engagedPos = getEngagedPos();           // AD12 — the position of the image engaged via a panel/crop (pin, Bug 86)
    const head = state.selection.main.head;

    if (isLivePreview) {
      // AD10 — the embeds come from Obsidian's OWN parse (collectEmbeds enumerates the syntaxTree image/
      // embed nodes); the regex only PARSED each located span. ONE uniform AB16b mechanism then builds
      // standalone / bare-block / inline from the same per-embed decision — no `:has`, no `.cm-active` guess.
      for (const e of collectEmbeds(state, renderInCode)) {
        const line = state.doc.lineAt(e.from);
        const isDismissed = dismissed.has(e.attrEnd); // per-EMBED key (e.attrEnd) — two embeds on one line dismiss independently; no inline exception
        const reveal = resolveLinkReveal({
          mode: revealMode,
          dismissed: isDismissed,
          engaged: engagedPos !== null && engagedPos >= e.from && engagedPos <= e.attrEnd, // AD12 pin (Bug 86)
          onLine: head >= line.from && head <= line.to,
          hovered: line.from === hoveredLine,
          cursorInBody: head >= e.from && head <= e.embedEnd,        // D16: cursor in the body → native carries it
          cursorInAttr: e.attrEnd > e.embedEnd && head >= e.embedEnd && head <= e.attrEnd,
        });
        // (1) The stand-in fake link — per-embed `lie-show` from the AB16b decision (standalone/inline;
        //     for a block embed it is swallowed off-line — the bare stand-in is hosted in the widget at (3)).
        builder.add(e.from, e.from, Decoration.widget({ widget: new FakeLinkWidget(e.embed, reveal.showStandIn), side: -1 }));
        // (1b) DISMISS suppresses ONLY this embed's link (Bug 65, link-only): hide Obsidian's OWN native
        //      body tokens over the BODY span (e.from…e.embedEnd) — NOT the whole cm-line — so a sibling
        //      embed or surrounding text on the same line is untouched, and it works for inline too (no
        //      line-level exception). The stand-in + {…} hide via their own withheld `lie-show`.
        if (reveal.suppressNative) {
          builder.add(e.from, e.embedEnd, Decoration.mark({ class: "lie-suppress-native" }));
        }
        // (2) The {…} attr list — NATIVE editable text, marked + url-string highlighted (URL_CLASS, no
        //     cm-formatting — Bug 55), `lie-show` per the decision (shows/hides as one whole with the body, D17).
        if (e.attrEnd > e.embedEnd) {
          builder.add(e.embedEnd, e.attrEnd, Decoration.mark({ class: reveal.showAttr ? `lie-attr lie-show ${URL_CLASS}` : `lie-attr ${URL_CLASS}` }));
        }
        // (3) The plugin's own transformed image (native image CSS-suppressed). A bare embed (no `{…}`) is
        //     block-promoted by Obsidian → a `block:true` widget that HOSTS the stand-in; the reveal flip is
        //     applied via `updateDOM` (in place) so the image + caption are never rebuilt (no flicker / 1c).
        const w = new EmbedWidget(app, e.embed, e.params, sourcePath, getActions, e.mode, e.mode === "block" ? reveal.showStandIn : false, e.mode === "block" ? reveal.reserveStandIn : false, showCaptions, isDismissed);
        builder.add(e.attrEnd, e.attrEnd, e.mode === "block" ? Decoration.widget({ widget: w, block: true, side: 1 }) : Decoration.widget({ widget: w, side: 1 }));
      }
    } else {
      // Source mode: no widgets — just highlight each `{…}` attr list as link syntax, per line.
      for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        for (const d of lineDecorations(line.text, line.from, false)) {
          if (d.kind === "mark") builder.add(d.from, d.to, Decoration.mark({ class: d.class }));
        }
      }
    }
    return builder.finish();
  };

  // Compute the next dismissed/hovered state by lifting this transaction's reveal events out of the
  // CM `Transaction` and delegating the DECISION to the pure `reduceReveal` (unit-tested in
  // live-preview-logic). `<>` toggles `dismissed`; mouse enter/leave tracks the hovered line; the
  // auto-clear (auto mode) resets a dismiss once you LEAVE the image — see `reduceReveal` for the
  // full state-machine contract (incl. the fresh-dismiss-survives-its-own-transaction guard).
  const nextState = (
    value: LivePreviewState,
    tr: import("@codemirror/state").Transaction
  ): { dismissed: Set<number>; hoveredLine: number | null } => {
    const toggles: number[] = [];
    const hovers: { line: number; on: boolean }[] = [];
    for (const e of tr.effects) {
      if (e.is(toggleReveal)) toggles.push(e.value);
      else if (e.is(setHover)) hovers.push(e.value);
    }
    return reduceReveal(value, {
      remap: tr.docChanged ? (pos) => tr.changes.mapPos(pos, 1) : null,
      toggles,
      hovers,
      activeLineFrom: tr.state.doc.lineAt(tr.state.selection.main.head).from,
      mode: getRevealMode(),
      // dismissed keys are EMBED positions (e.attrEnd); map each back to its line for the auto-clear.
      lineOf: (pos) => tr.state.doc.lineAt(Math.min(pos, tr.state.doc.length)).from,
    });
  };

  const field = StateField.define<LivePreviewState>({
    create(state) {
      const dismissed = new Set<number>();
      return { dismissed, hoveredLine: null, decorations: build(state, dismissed, null) };
    },
    update(value, tr) {
      const { dismissed, hoveredLine } = nextState(value, tr);
      const dismissedChanged = dismissed !== value.dismissed;
      const hoverChanged = hoveredLine !== value.hoveredLine; // the reveal line marker depends on hover (auto mode)
      const modeChanged =
        tr.startState.field(editorLivePreviewField) !== tr.state.field(editorLivePreviewField);
      const refresh = tr.effects.some((e) => e.is(refreshDecorations));
      if (tr.docChanged || tr.selection || modeChanged || dismissedChanged || hoverChanged || refresh) {
        return { dismissed, hoveredLine, decorations: build(tr.state, dismissed, hoveredLine) };
      }
      return value;
    },
    provide(f) {
      return EditorView.decorations.from(f, (v) => v.decorations);
    },
  });

  // AD10 — the parse is INCREMENTAL: `syntaxTree` covers only the region parsed so far, and the
  // StateField does NOT otherwise rebuild when the background parser advances. So when the tree grows
  // (a pure parse-progress update, no doc/selection change), dispatch a refresh so embeds in the
  // newly-parsed region render. Guarded to the growth case → it settles once fully parsed (no loop).
  const reparseRebuild = EditorView.updateListener.of((update) => {
    if (!update.state.field(editorLivePreviewField)) return;
    if (syntaxTree(update.state).length > syntaxTree(update.startState).length) {
      Promise.resolve().then(() => { try { update.view.dispatch({ effects: refreshDecorations.of() }); } catch { /* view gone */ } });
    }
  });

  return [field, reparseRebuild];
}
