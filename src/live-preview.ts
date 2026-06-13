import { App, TFile, editorLivePreviewField, setIcon } from "obsidian";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { parseAltText, getWidthPx, getHeightPx, applyNativeSize, ImageTransform } from "./transforms";
import { parseEmbedLine } from "./link-format";
import { lineDecorations, inlineEmbeds, rewriteWidth, reduceReveal, EMBED_LINE, URL_CLASS } from "./live-preview-logic";
import { estimatedBlockHeight } from "./renderer-logic";
import { captionMarkdown, createCaption, CaptionHandle } from "./caption";
import { buildLayers as applyTransformToImage } from "./render-core";
import { ToolbarItem, buildToolbarElement } from "./toolbar";
import { writeSource } from "./source-writer";
import { t } from "./i18n";

// Force a rebuild when external state (captions / reveal mode settings) changed.
export const refreshDecorations = StateEffect.define<void>();

// `<>` TOGGLE for the per-line `dismissed` state (F8): transiently click the link source away,
// click again to bring it back. Transient (not persisted); auto-clears in auto mode.
const toggleReveal = StateEffect.define<number>();
// Whether a line's image is mouse-hovered (line-start pos), so the auto-clear can tell when the
// source is NaturalReveal:false (neither hovered nor the cursor's active line).
const setHover = StateEffect.define<{ line: number; on: boolean }>();
// Suppresses a `<>`-dismissed line's source, overriding the natural reveal. Added as a LINE
// decoration so the CSS (`.lie-dismissed .lie-fake-link/.lie-attr`) can hide it.
const DISMISSED_LINE = Decoration.line({ class: "lie-dismissed" });

// Natural-reveal mode for the link source: "auto" = on cm-line hover / the active line; "always"
// = everywhere (the global default-state setting). The `<>` dismiss is a SEPARATE per-line
// override on top of this — no longer a third mode.
type RevealMode = "auto" | "always";
// "standalone" = a `{…}` embed: an inline widget in the embed's OWN (non-BFC) cm-line, so
// lie-left/right floats escape into `.cm-content` and wrap the following lines (R0). "block"
// = a BARE (block-promoted, no cm-line) embed: a block:true `.cm-content` child, since an
// inline widget would be swallowed there. "inline" = a tiny mid-text icon (lie-inline).
type WidgetMode = "block" | "inline" | "standalone";

// Syntax-highlight an embed's source into spans carrying Obsidian's own CM token
// classes (themed because the widget lives inside `.cm-editor`). Only the embed part
// (`![[…]]` / `![](…)`) — the trailing `{…}` is the NATIVE marked text, never the fake.
function highlightEmbed(embed: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const span = (cls: string, text: string): void => {
    if (!text) return;
    const s = document.createElement("span");
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
  constructor(private embed: string, private mode: RevealMode) { super(); }
  eq(o: FakeLinkWidget): boolean { return o.embed === this.embed && o.mode === this.mode; }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = `lie-fake-link lie-rev-${this.mode}`;
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
    private revealMode: RevealMode,
    private showCaptions: boolean,
    private dismissed: boolean
  ) {
    super();
  }

  private sig(): string {
    return `${this.embed}|${this.params}|${this.sourcePath}|${this.mode}|${this.revealMode}|${this.showCaptions}|${this.dismissed}`;
  }
  eq(other: EmbedWidget): boolean { return this.sig() === other.sig(); }

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
    const wrapper = document.createElement("div");
    // Inline icons never carry an in-chrome toolbar (too small) — flag them `lie-float` so
    // the plugin shows the floating toolbar on hover (standalone/block widgets get the flag
    // dynamically from the reflow when they turn out too short).
    wrapper.className =
      this.mode === "inline" ? "lie-wrapper lie-wrapper-inline lie-float"
      : this.mode === "standalone" ? "lie-wrapper lie-wrapper-standalone"
      : "lie-wrapper lie-wrapper-block";
    wrapper.setAttribute("contenteditable", "false");

    const file = this.resolveFile();
    if (!file) { wrapper.textContent = this.embed; return wrapper; }

    if (this.mode === "inline") {
      const inlineImg = document.createElement("img");
      inlineImg.src = this.app.vault.getResourcePath(file);
      inlineImg.dataset["lieSrc"] = file.path;
      wrapper.appendChild(inlineImg);
      applyTransformToImage(inlineImg, this.parsedTransform());
      return wrapper;
    }

    const area = document.createElement("div");
    area.className = "lie-box";
    wrapper.appendChild(area);

    const img = document.createElement("img");
    img.src = this.app.vault.getResourcePath(file);
    img.dataset["lieSrc"] = file.path;
    area.appendChild(img);
    applyTransformToImage(img, this.parsedTransform());

    // Wrap the image (`.lie-image-area`) and the resize handle in a non-clipping host that
    // shrink-wraps the IMAGE only, so the handle's `bottom:0` anchors to the image corner — not the
    // `.lie-box` bottom, which a caption (a sibling flex item, D9) extends below the image. The box
    // stays the caption shrink-host (D9); the host has no `overflow:hidden`, so the corner marker
    // sits centred on the corner (half outside) without being clipped by the image-area's own clip.
    const host = document.createElement("div");
    host.className = "lie-image-host";
    const imageArea = img.closest<HTMLElement>(".lie-image-area");
    if (imageArea) host.appendChild(imageArea);
    host.appendChild(this.makeResizeCorner(view, wrapper, img));
    area.appendChild(host);
    area.appendChild(this.makeToolbar(view, img, wrapper));
    if (this.showCaptions) {
      const caption = createCaption(this.app, captionMarkdown(this.embed), this.sourcePath);
      if (caption) {
        area.classList.add("lie-has-caption");
        area.appendChild(caption.el);
        (wrapper as unknown as { _lieCaption?: CaptionHandle })._lieCaption = caption;
      }
    }

    // Click the image (not a button) → caret onto the line so the native source reveals
    // for editing (F9 — the `{…}` is native editable text above the image).
    area.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".lie-toolbar, .image-resize-corner")) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: view.state.doc.lineAt(view.posAtDOM(wrapper)).from } });
      view.focus();
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

  private makeToolbar(view: EditorView, img: HTMLImageElement, wrapper: HTMLElement): HTMLElement {
    const toolbar = buildToolbarElement(this.getActions(img));
    toolbar.classList.add("lie-toolbar-in-image");
    const sep = document.createElement("span");
    sep.className = "lie-toolbar-sep";
    toolbar.prepend(sep);
    toolbar.prepend(this.makeRevealButton(view, wrapper));
    return toolbar;
  }

  // The `<>` toggle (F8/Bug 53): click the link source AWAY (dismiss), click again to bring it
  // back. The icon is the Lucide "code" glyph (`<>`) in BOTH states — the dismissed state shows
  // faint (`is-off`) and the tooltip/aria flips, so the affordance stays honest without changing
  // the icon to an eye.
  private makeRevealButton(view: EditorView, wrapper: HTMLElement): HTMLElement {
    const button = document.createElement("button");
    button.className = "lie-toolbar-btn lie-toolbar-reveal";
    if (this.dismissed) button.classList.add("is-off");
    const label = this.dismissed ? t("revealLink") : t("hideLinkSource");
    button.setAttribute("aria-label", label);
    button.title = label;
    setIcon(button, "code");
    button.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ effects: toggleReveal.of(view.state.doc.lineAt(view.posAtDOM(wrapper)).from) });
    });
    return button;
  }

  private resolveFile(): TFile | null {
    const md = this.embed.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    const wiki = this.embed.match(/^!\[\[([^\]|]+)/);
    const linkpath = decodeURIComponent(md?.[1] ?? wiki?.[1] ?? "");
    if (!linkpath) return null;
    return this.app.metadataCache.getFirstLinkpathDest(linkpath, this.sourcePath);
  }

  private makeResizeCorner(view: EditorView, wrapper: HTMLElement, img: HTMLImageElement): HTMLElement {
    const corner = document.createElement("div");
    corner.className = "image-resize-corner";
    corner.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const box = img.closest<HTMLElement>(".lie-image-area") ?? img;
      const startX = e.clientX;
      const startWidth = box.getBoundingClientRect().width;
      const widthAt = (ev: PointerEvent) => Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
      const onMove = (ev: PointerEvent) => { box.style.width = `${widthAt(ev)}px`; };
      const onUp = (ev: PointerEvent) => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const line = view.state.doc.lineAt(view.posAtDOM(wrapper));
        const replacement = rewriteWidth(line.text, widthAt(ev));
        if (replacement === null) return;
        // Move the cursor onto the resized image's line (D11): the resize handle is reachable on
        // HOVER without first clicking the image, so the caret may sit anywhere (offset 0). Pass
        // `line.from` so writeSource seeds the change's startSelection — otherwise cmd+Z restores
        // the offset-0 selection and scrolls to the document top.
        writeSource(view, { from: line.from, to: line.to, insert: replacement }, line.from);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
    return corner;
  }
}

interface LivePreviewState {
  dismissed: Set<number>;     // line-start positions whose source is `<>`-dismissed (transient)
  hoveredLine: number | null; // line-start of the currently mouse-hovered image (for auto-clear)
  decorations: DecorationSet;
}

export function createLivePreviewExtension(
  app: App,
  getSourcePath: () => string,
  getActions: (img: HTMLImageElement) => ToolbarItem[],
  getShowCaptions: () => boolean,
  getAlwaysShow: () => boolean
) {
  const build = (
    state: import("@codemirror/state").EditorState,
    dismissed: Set<number>
  ): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const isLivePreview = state.field(editorLivePreviewField);
    const sourcePath = getSourcePath();
    const showCaptions = getShowCaptions();
    const revealMode: RevealMode = getAlwaysShow() ? "always" : "auto";

    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      for (const d of lineDecorations(line.text, line.from, isLivePreview)) {
        if (d.kind === "widget") {
          const isDismissed = dismissed.has(d.from);
          const m = EMBED_LINE.exec(line.text);
          const embedEnd = d.from + (m?.[1]?.length ?? 0) + d.embed.length;
          // The reveal is DECLARATIVE in CSS: the fake link + {…} ride on the mode class plus
          // Obsidian's `.cm-active` / cm-line hover; the fake yields to the native source via
          // `.cm-line:has(> .cm-formatting)`. A `<>`-dismissed line additionally gets a
          // `.lie-dismissed` LINE class that overrides (hides) the source until it auto-resets
          // (auto: on leave — neither hovered nor active; always: until `<>` again / reload).
          // (0) The dismiss flag on the line.
          if (isDismissed) builder.add(d.from, d.from, DISMISSED_LINE);
          // (1) The fake link (the swallowed embed source).
          builder.add(d.from, d.from, Decoration.widget({ widget: new FakeLinkWidget(d.embed, revealMode), side: -1 }));
          // (2) The {…} block — NATIVE editable text, marked. It rides `lie-attr lie-rev-<mode>`
          // (so CSS shows/hides it per mode + the dismiss, F3) AND carries the CM url-string token
          // classes (`cm-string cm-url`, = URL_CLASS) so the revealed block is SYNTAX-HIGHLIGHTED
          // like a (url) string (Bug 55: the bare-key/inline-widget migration had dropped the
          // highlight). Crucially NOT `cm-formatting` — that would make the cm-line match
          // `:has(> .cm-formatting)`, the heuristic that detects Obsidian's OWN native source
          // reveal, and wrongly hide the fake link (regression caught by scripts/verify-reveal.mjs).
          if (m && m[3]) {
            builder.add(embedEnd, embedEnd + m[3].length, Decoration.mark({ class: `lie-attr lie-rev-${revealMode} ${URL_CLASS}` }));
          }
          // (3) The transformed image — UNIFORM: the plugin always draws it, and the native
          // image is always CSS-suppressed. A `{…}` embed keeps Obsidian's cm-line, so it is an
          // INLINE widget in that line (a lie-left/right float then escapes into `.cm-content`
          // and wraps the following lines; the fake-link + {…} share the line, R0). A BARE
          // `![](…)` line (no `{…}`) is BLOCK-PROMOTED by Obsidian into a cm-line-less
          // `.cm-content` child that swallows an inline widget — so render a BLOCK widget
          // (block:true) for it, which lands as its own `.cm-content` child next to the
          // (image-suppressed) native embed. `m[3]` is the `{…}` token: absent ⇒ bare.
          const isBare = !(m && m[3]);
          builder.add(
            d.to, d.to,
            isBare
              ? Decoration.widget({
                  widget: new EmbedWidget(app, d.embed, d.params, sourcePath, getActions, "block", revealMode, showCaptions, isDismissed),
                  block: true, side: 1,
                })
              : Decoration.widget({
                  widget: new EmbedWidget(app, d.embed, d.params, sourcePath, getActions, "standalone", revealMode, showCaptions, isDismissed),
                  side: 1,
                })
          );
        } else {
          builder.add(d.from, d.to, Decoration.mark({ class: d.class }));
        }
      }
      if (isLivePreview) {
        // Inline (mid-text / in-list) embeds get the SAME reveal machinery as the standalone path
        // (architecture AB16: "Inline embeds get the same widget; only chrome placement differs"). The
        // OLD cursor-skipped `Decoration.replace` DEVIATED from that: when the cursor entered the embed
        // the replace was dropped, so the native image (uniformly CSS-suppressed) vanished and the bare
        // `{…}` was left as stray text with NO link (Bug 100; the "double"/missing-attr reveal glitches).
        // Now — exactly like standalone — we never replace and never skip on the cursor: a fake link paints
        // the source for the reveal-for-looking, the `{…}` is a marked + highlighted native text, and the
        // plugin draws its own INLINE image widget after it. The native embed stays (image CSS-suppressed).
        for (const ie of inlineEmbeds(line.text, line.from)) {
          const attrStart = ie.from + ie.embed.length;
          // (1) The fake link (the source), revealed on cursor/hover via CSS.
          builder.add(ie.from, ie.from, Decoration.widget({ widget: new FakeLinkWidget(ie.embed, revealMode), side: -1 }));
          // (2) The {…} block — native editable text, marked + url-string highlighted (as standalone).
          if (ie.to > attrStart) {
            builder.add(attrStart, ie.to, Decoration.mark({ class: `lie-attr lie-rev-${revealMode} ${URL_CLASS}` }));
          }
          // (3) The transformed inline image widget, drawn by the plugin (native image suppressed).
          builder.add(ie.to, ie.to, Decoration.widget({ widget: new EmbedWidget(app, ie.embed, ie.params, sourcePath, getActions, "inline", revealMode, false, false), side: 1 }));
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
      alwaysShow: getAlwaysShow(),
    });
  };

  return StateField.define<LivePreviewState>({
    create(state) {
      const dismissed = new Set<number>();
      return { dismissed, hoveredLine: null, decorations: build(state, dismissed) };
    },
    update(value, tr) {
      const { dismissed, hoveredLine } = nextState(value, tr);
      const dismissedChanged = dismissed !== value.dismissed;
      const modeChanged =
        tr.startState.field(editorLivePreviewField) !== tr.state.field(editorLivePreviewField);
      const refresh = tr.effects.some((e) => e.is(refreshDecorations));
      if (tr.docChanged || tr.selection || modeChanged || dismissedChanged || refresh) {
        return { dismissed, hoveredLine, decorations: build(tr.state, dismissed) };
      }
      // Hover-only change: keep the decorations, just remember the hovered line.
      if (hoveredLine !== value.hoveredLine) {
        return { dismissed, hoveredLine, decorations: value.decorations };
      }
      return value;
    },
    provide(field) {
      return EditorView.decorations.from(field, (v) => v.decorations);
    },
  });
}
