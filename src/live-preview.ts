import { App, TFile, editorLivePreviewField, setIcon } from "obsidian";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { parseAltText, getWidthPx, getHeightPx } from "./transforms";
import { lineDecorations, inlineEmbeds, rewriteWidth, EMBED_LINE } from "./live-preview-logic";
import { estimatedBlockHeight } from "./renderer-logic";
import { captionMarkdown, createCaption, CaptionHandle } from "./caption";
import { applyTransformToImage } from "./renderer";
import { ToolbarItem, buildToolbarElement } from "./toolbar";
import { writeSource } from "./source-writer";
import { t } from "./i18n";

// Force a rebuild when external state (captions / reveal mode settings) changed.
export const refreshDecorations = StateEffect.define<void>();

// Toggle the per-image TEMPORARY hide of the link source (F8 `<>`): a transient
// in-memory override, NOT persisted, INDEPENDENT of the global reveal mode.
const toggleReveal = StateEffect.define<number>();

type RevealMode = "auto" | "always" | "hidden";
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
    private showCaptions: boolean
  ) {
    super();
  }

  private sig(): string {
    return `${this.embed}|${this.params}|${this.sourcePath}|${this.mode}|${this.revealMode}|${this.showCaptions}`;
  }
  eq(other: EmbedWidget): boolean { return this.sig() === other.sig(); }

  get estimatedHeight(): number {
    // Only block:true widgets need an estimate (CM models them out of flow); inline and
    // standalone widgets are measured in the line's natural flow.
    if (this.mode !== "block") return -1;
    const tf = parseAltText(this.params);
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
      applyTransformToImage(inlineImg, parseAltText(this.params));
      return wrapper;
    }

    const area = document.createElement("div");
    area.className = "lie-box";
    wrapper.appendChild(area);

    const img = document.createElement("img");
    img.src = this.app.vault.getResourcePath(file);
    img.dataset["lieSrc"] = file.path;
    area.appendChild(img);
    applyTransformToImage(img, parseAltText(this.params));

    area.appendChild(this.makeResizeCorner(view, wrapper, img));
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

  // `<>` — temporarily HIDE the link source for this image, independent of the global
  // mode (F8). Toggles a transient per-line override; shown faint when hiding.
  private makeRevealButton(view: EditorView, wrapper: HTMLElement): HTMLElement {
    const button = document.createElement("button");
    button.className = "lie-toolbar-btn lie-toolbar-reveal";
    if (this.revealMode === "hidden") button.classList.add("is-off");
    button.setAttribute("aria-label", t("revealLink"));
    button.title = t("revealLink");
    setIcon(button, "code-2");
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
        writeSource(view, { from: line.from, to: line.to, insert: replacement });
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
    return corner;
  }
}

interface LivePreviewState {
  hidden: Set<number>; // line-start positions whose link is temporarily `<>`-hidden
  decorations: DecorationSet;
}

export function createLivePreviewExtension(
  app: App,
  getSourcePath: () => string,
  getActions: (img: HTMLImageElement) => ToolbarItem[],
  getShowCaptions: () => boolean,
  getAlwaysShow: () => boolean
) {
  const modeFor = (lineFrom: number, hidden: Set<number>): RevealMode =>
    hidden.has(lineFrom) ? "hidden" : (getAlwaysShow() ? "always" : "auto");

  const build = (
    state: import("@codemirror/state").EditorState,
    hidden: Set<number>
  ): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const isLivePreview = state.field(editorLivePreviewField);
    const sourcePath = getSourcePath();
    const showCaptions = getShowCaptions();
    const head = state.selection.main.head;

    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      for (const d of lineDecorations(line.text, line.from, isLivePreview)) {
        if (d.kind === "widget") {
          const mode = modeFor(d.from, hidden);
          const m = EMBED_LINE.exec(line.text);
          const embedEnd = d.from + (m?.[1]?.length ?? 0) + d.embed.length;
          // The reveal is FULLY DECLARATIVE in CSS (AD5/R0) — no JS cursor logic at all. The
          // fake link + {…} ride on Obsidian's own active-line class `.cm-active` and the mode
          // class; the fake additionally YIELDS to Obsidian's native source-reveal purely in
          // CSS: when the cursor enters the embed, Obsidian renders the source's syntax tokens
          // as the line's direct children (`.cm-line:has(> .cm-formatting)`) and the fake hides.
          // Slaved to that one DOM state, the fake and the native source are never both present
          // — no transient double, no off-by-one boundary gap — and the fake is always in the
          // DOM (only CSS-hidden), so there is no widget-creation lag on reveal.
          // (1) The fake link (the swallowed embed source).
          builder.add(d.from, d.from, Decoration.widget({ widget: new FakeLinkWidget(d.embed, mode), side: -1 }));
          // (2) The {…} block — NATIVE editable text, marked; CSS shows it per mode (F3).
          if (m && m[3]) {
            builder.add(embedEnd, embedEnd + m[3].length, Decoration.mark({ class: `lie-attr lie-rev-${mode}` }));
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
                  widget: new EmbedWidget(app, d.embed, d.params, sourcePath, getActions, "block", mode, showCaptions),
                  block: true, side: 1,
                })
              : Decoration.widget({
                  widget: new EmbedWidget(app, d.embed, d.params, sourcePath, getActions, "standalone", mode, showCaptions),
                  side: 1,
                })
          );
        } else {
          builder.add(d.from, d.to, Decoration.mark({ class: d.class }));
        }
      }
      if (isLivePreview) {
        for (const ie of inlineEmbeds(line.text, line.from)) {
          if (head >= ie.from && head <= ie.to) continue;
          builder.add(
            ie.from, ie.to,
            Decoration.replace({
              widget: new EmbedWidget(app, ie.embed, ie.params, sourcePath, getActions, "inline", "auto", false),
            })
          );
        }
      }
    }
    return builder.finish();
  };

  const nextHidden = (
    cur: Set<number>,
    tr: import("@codemirror/state").Transaction
  ): Set<number> => {
    let next = cur;
    if (tr.docChanged) {
      next = new Set();
      for (const pos of cur) next.add(tr.changes.mapPos(pos, 1));
    }
    for (const e of tr.effects) {
      if (e.is(toggleReveal)) {
        if (next === cur) next = new Set(next);
        if (next.has(e.value)) next.delete(e.value); else next.add(e.value);
      }
    }
    return next;
  };

  return StateField.define<LivePreviewState>({
    create(state) {
      const hidden = new Set<number>();
      return { hidden, decorations: build(state, hidden) };
    },
    update(value, tr) {
      const hidden = nextHidden(value.hidden, tr);
      const modeChanged =
        tr.startState.field(editorLivePreviewField) !== tr.state.field(editorLivePreviewField);
      const refresh = tr.effects.some((e) => e.is(refreshDecorations));
      if (tr.docChanged || tr.selection || modeChanged || hidden !== value.hidden || refresh) {
        return { hidden, decorations: build(tr.state, hidden) };
      }
      return value;
    },
    provide(field) {
      return EditorView.decorations.from(field, (v) => v.decorations);
    },
  });
}
