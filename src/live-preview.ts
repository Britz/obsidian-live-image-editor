import { App, TFile, editorLivePreviewField, setIcon } from "obsidian";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { parseAltText } from "./transforms";
import { lineDecorations, rewriteWidth, RevealMode, cycleRevealMode } from "./live-preview-logic";
import { applyTransformToImage } from "./renderer";
import { ToolbarItem, buildToolbarElement } from "./toolbar";
import { t } from "./i18n";

// Cycle the reveal MODE of a given image line (AUTO → ON → OFF → AUTO). Carries
// the line-start position; a StateField holds each line's mode. This is our own
// per-image tri-state reveal (id = line position), not Obsidian's cursor-driven
// native reveal (F5/D6).
const toggleReveal = StateEffect.define<number>();

// Per-mode tooltip key and on-icon badge for the `<>` control (D4).
const REVEAL_LABEL = { auto: "revealAuto", on: "revealOn", off: "revealOff" } as const;
const REVEAL_BADGE: Record<RevealMode, string> = { auto: "A", on: "●", off: "○" };

// Render the image embed + transform as one unit, REUSING Obsidian's native image
// rendering (embedRegistry creator), then add the live-preview chrome Obsidian
// would normally add (edit-block button, resize handle) and apply the transform.
class EmbedWidget extends WidgetType {
  constructor(
    private app: App,
    private embed: string,
    private params: string,
    private sourcePath: string,
    private getActions: (img: HTMLImageElement) => ToolbarItem[],
    private mode: RevealMode,
    private rawLine: string,
    private autofocus: boolean
  ) {
    super();
  }

  // Cursor moves rebuild the StateField (T-L2) but mustn't recreate this DOM (that
  // would unload/reload the embed and flicker) — eq() returns true when nothing
  // visible changed, so CM keeps the existing DOM on a pure selection change.
  eq(other: EmbedWidget): boolean {
    return (
      other.embed === this.embed &&
      other.params === this.params &&
      other.sourcePath === this.sourcePath &&
      other.mode === this.mode &&
      other.rawLine === this.rawLine
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "internal-embed media-embed image-embed lie-lp-embed";
    container.setAttribute("contenteditable", "false");
    // Obsidian's .internal-embed sets `contain: paint` (in core CSS we can't beat
    // on specificity), which paint-clips the toolbar to the image box — cutting it
    // off on a small/rotated image. Inline !important is the version-proof override.
    container.style.setProperty("contain", "none", "important");

    const file = this.resolveFile();
    if (!file) {
      container.textContent = this.embed;
      return container;
    }

    const wrapper = container.createDiv("image-wrapper");

    // Native image rendering, reused from Obsidian's own embed creator
    // (embedRegistry is an internal API not in the public typings).
    const registry = (this.app as unknown as {
      embedRegistry: {
        getEmbedCreator(f: TFile): (
          ctx: { app: App; containerEl: HTMLElement; sourcePath: string; displayMode: boolean; showInline: boolean; depth: number; linktext: string },
          file: TFile,
          subpath: string
        ) => { loadFile?: () => void; unload?: () => void };
      };
    }).embedRegistry;
    const creator = registry.getEmbedCreator(file);
    const embed = creator(
      { app: this.app, containerEl: wrapper, sourcePath: this.sourcePath, displayMode: true, showInline: false, depth: 0, linktext: file.path },
      file,
      ""
    );
    embed.loadFile?.();
    (container as unknown as { _lieEmbed: unknown })._lieEmbed = embed;

    const transform = parseAltText(this.params);
    const finish = (): boolean => {
      const img = wrapper.querySelector("img");
      if (!img) return false;
      applyTransformToImage(img, transform);
      wrapper.appendChild(this.makeResizeCorner(view, container));
      // Anchor the toolbar to the image box (wrapper), not the outer container —
      // otherwise when the link editor is revealed above, the toolbar would sit
      // over the editor instead of staying on the image.
      wrapper.appendChild(this.makeToolbar(view, img as HTMLImageElement, container));
      // A quarter-turn's reflow box needs the element attached AND laid out, but
      // finish() can run mid-render (cached img, container not yet inserted/sized),
      // when the box silently fails to form. Re-apply each frame until the box is
      // actually there (reconcile proves applyTransformToImage works once stable).
      const isQuarterTurn = !!(transform.rotate && transform.rotate % 180 !== 0);
      if (isQuarterTurn) {
        const ensureBox = (tries: number): void => {
          if (wrapper.querySelector(".lie-rotate-box")) return;
          applyTransformToImage(img as HTMLImageElement, transform);
          if (tries > 0) requestAnimationFrame(() => ensureBox(tries - 1));
        };
        requestAnimationFrame(() => ensureBox(30));
      }
      return true;
    };
    if (!finish()) {
      const observer = new MutationObserver(() => {
        if (finish()) observer.disconnect();
      });
      observer.observe(wrapper, { childList: true, subtree: true });
      window.setTimeout(() => observer.disconnect(), 5000);
    }

    // Reveal modes (F5): ON keeps the editable raw link visible above the image;
    // AUTO shows it together with the toolbar (on hover, via CSS); OFF hides it.
    // The container goes full-width/left-aligned (lie-lp-revealed) so the link
    // reads like a regular document line, not constrained to the image's width.
    if (this.mode === "on" || this.mode === "auto") {
      // ON: full-width/revealed always. AUTO: only on hover (the reveal styling is
      // applied by :hover in CSS), so a default image looks normal until hovered.
      container.classList.add(this.mode === "on" ? "lie-lp-revealed" : "lie-lp-reveal-auto");
      container.prepend(this.makeLinkEditor(view, container));
    }

    return container;
  }

  destroy(dom: HTMLElement): void {
    const embed = (dom as unknown as { _lieEmbed?: { unload?: () => void } })._lieEmbed;
    embed?.unload?.();
  }

  // The editing toolbar, living inside the image at the top, hover-revealed via
  // CSS — not floating fixed on the page. The <> (edit source) button is appended
  // at the far right (where Obsidian's native edit-block button used to sit).
  private makeToolbar(view: EditorView, img: HTMLImageElement, container: HTMLElement): HTMLElement {
    const toolbar = buildToolbarElement(this.getActions(img));
    toolbar.classList.add("lie-toolbar-in-image");
    toolbar.appendChild(this.makeEditButton(view, container));
    return toolbar;
  }

  private resolveFile(): TFile | null {
    const md = this.embed.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    const wiki = this.embed.match(/^!\[\[([^\]|]+)/);
    const linkpath = decodeURIComponent(md?.[1] ?? wiki?.[1] ?? "");
    if (!linkpath) return null;
    return this.app.metadataCache.getFirstLinkpathDest(linkpath, this.sourcePath);
  }

  // The revealed link editor — shown ABOVE the image (the image stays). Rendered as
  // borderless, full-content-width, auto-growing text (no box, no resize handle) so
  // it reads like the surrounding document text and wraps fully. Edits write back on
  // Enter/blur; Enter/Escape toggle the editor back off.
  private makeLinkEditor(view: EditorView, container: HTMLElement): HTMLElement {
    const textarea = document.createElement("textarea");
    textarea.className = "lie-link-editor";
    textarea.value = this.rawLine;
    textarea.spellcheck = false;
    textarea.rows = 1;
    textarea.addEventListener("mousedown", (e) => e.stopPropagation());

    const autoGrow = (): void => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    textarea.addEventListener("input", autoGrow);

    const commit = (): void => {
      const line = view.state.doc.lineAt(view.posAtDOM(container));
      if (textarea.value !== line.text) {
        view.dispatch({ changes: { from: line.from, to: line.to, insert: textarea.value } });
      }
    };
    textarea.addEventListener("blur", commit);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        this.dispatchToggle(view, container);
      } else if (e.key === "Escape") {
        textarea.value = this.rawLine;
        this.dispatchToggle(view, container);
      }
    });

    window.setTimeout(() => {
      autoGrow();
      if (this.autofocus) textarea.focus();
    }, 0);
    return textarea;
  }

  // Our own "<>" button — a per-image TRI-state control (F5/D6). Click cycles the
  // mode (AUTO → ON → OFF → AUTO); the current mode is shown on the button itself
  // via colour class + tooltip (D4). Driven by our StateField (keyed on the line
  // position), independent of the editor cursor.
  private makeEditButton(view: EditorView, container: HTMLElement): HTMLElement {
    const button = document.createElement("button");
    button.className = `lie-toolbar-btn lie-toolbar-edit lie-reveal-${this.mode}`;
    const modeLabel = t(REVEAL_LABEL[this.mode]);
    button.setAttribute("aria-label", `${t("revealLink")} — ${modeLabel}`);
    button.title = `${t("revealLink")} — ${modeLabel}`;
    setIcon(button, "code-2");
    // A small mode badge (A/●/○) on top of the icon so the state reads at a glance
    // even without colour (D4).
    const badge = document.createElement("span");
    badge.className = "lie-reveal-badge";
    badge.textContent = REVEAL_BADGE[this.mode];
    button.appendChild(badge);
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dispatchToggle(view, container);
    });
    return button;
  }

  private dispatchToggle(view: EditorView, container: HTMLElement): void {
    const lineStart = view.state.doc.lineAt(view.posAtDOM(container)).from;
    view.dispatch({ effects: toggleReveal.of(lineStart) });
  }

  // The resize handle — drag writes the new width into the portable {…} block.
  private makeResizeCorner(view: EditorView, container: HTMLElement): HTMLElement {
    const corner = document.createElement("div");
    corner.className = "image-resize-corner";
    corner.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const img = container.querySelector("img");
      if (!img) return;
      // For a rotated image the visible box is the .lie-rotate-box, not the img
      // (which is absolutely positioned inside it); scale that box live. The width
      // we drag is the bounding-box width, which is exactly what writeWidth stores.
      const box = img.closest<HTMLElement>(".lie-rotate-box");
      const target = box ?? img;
      const startX = e.clientX;
      const startWidth = target.getBoundingClientRect().width;
      const widthAt = (ev: PointerEvent) => Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
      const onMove = (ev: PointerEvent) => {
        const w = widthAt(ev);
        if (box) {
          box.style.transformOrigin = "top left";
          box.style.transform = `scale(${w / startWidth})`;
        } else {
          img.style.width = `${w}px`;
        }
      };
      const onUp = (ev: PointerEvent) => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        this.writeWidth(view, container, widthAt(ev));
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
    return corner;
  }

  private writeWidth(view: EditorView, container: HTMLElement, width: number): void {
    const pos = view.posAtDOM(container);
    const line = view.state.doc.lineAt(pos);
    const replacement = rewriteWidth(line.text, width);
    if (replacement === null) return;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: replacement } });
  }
}

/**
 * Live-preview extension. A StateField (required for block decorations) replaces
 * each `![…](…){…}` line with one widget that wraps Obsidian's native image embed
 * plus the live-preview chrome, so the {…} is part of the same unit. The active
 * line / source mode instead get marks so the {…} is highlighted as link syntax.
 * Register with Prec.highest to override Obsidian's own embed widget.
 */
// One field value: the set of line-start positions whose link source is currently
// revealed (toggled by <>), plus the decorations derived from it. Kept in a SINGLE
// field — a second field read cross-field in update() can hit "Field is not present
// in this state" depending on registration order, which crashes plugin load.
interface LivePreviewState {
  // Per-line reveal mode keyed on line-start position; absent ⇒ AUTO (the default).
  modes: Map<number, RevealMode>;
  decorations: DecorationSet;
}

export function createLivePreviewExtension(
  app: App,
  getSourcePath: () => string,
  getActions: (img: HTMLImageElement) => ToolbarItem[]
) {
  const build = (
    state: import("@codemirror/state").EditorState,
    modes: Map<number, RevealMode>,
    pendingFocus: number | null
  ): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const isLivePreview = state.field(editorLivePreviewField);
    const sourcePath = getSourcePath();

    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      for (const d of lineDecorations(line.text, line.from, isLivePreview)) {
        if (d.kind === "widget") {
          builder.add(
            d.from,
            d.to,
            Decoration.replace({
              widget: new EmbedWidget(
                app,
                d.embed,
                d.params,
                sourcePath,
                getActions,
                modes.get(d.from) ?? "auto",
                line.text,
                d.from === pendingFocus
              ),
              block: true,
            })
          );
        } else {
          builder.add(d.from, d.to, Decoration.mark({ class: d.class }));
        }
      }
    }
    return builder.finish();
  };

  // Apply doc edits (remap mode positions) and <> clicks (cycle the mode) to the
  // mode map. Returns the same map reference when nothing changed.
  const nextModes = (
    cur: Map<number, RevealMode>,
    tr: import("@codemirror/state").Transaction
  ): Map<number, RevealMode> => {
    let next = cur;
    if (tr.docChanged) {
      next = new Map();
      for (const [pos, mode] of cur) next.set(tr.changes.mapPos(pos, 1), mode);
    }
    for (const e of tr.effects) {
      if (e.is(toggleReveal)) {
        if (next === cur) next = new Map(next);
        const cycled = cycleRevealMode(next.get(e.value) ?? "auto");
        if (cycled === "auto") next.delete(e.value);
        else next.set(e.value, cycled);
      }
    }
    return next;
  };

  // Which line (if any) this transaction freshly switched to ON — only then does
  // the editor autofocus, so committing/re-rendering doesn't yank focus back when
  // you click away, and AUTO (hover-shown) never steals focus.
  const freshlyOn = (
    tr: import("@codemirror/state").Transaction,
    modes: Map<number, RevealMode>
  ): number | null => {
    for (const e of tr.effects) {
      if (e.is(toggleReveal) && modes.get(e.value) === "on") return e.value;
    }
    return null;
  };

  return StateField.define<LivePreviewState>({
    create(state) {
      const modes = new Map<number, RevealMode>();
      return { modes, decorations: build(state, modes, null) };
    },
    update(value, tr) {
      const modes = nextModes(value.modes, tr);
      const modeChanged =
        tr.startState.field(editorLivePreviewField) !== tr.state.field(editorLivePreviewField);
      // Rebuild on edits, live-preview ↔ source mode toggles, selection changes
      // (T-L2 — eq() keeps the DOM stable so this doesn't flicker the embed), and
      // reveal-mode changes.
      if (tr.docChanged || tr.selection || modeChanged || modes !== value.modes) {
        return { modes, decorations: build(tr.state, modes, freshlyOn(tr, modes)) };
      }
      return value;
    },
    provide(field) {
      return EditorView.decorations.from(field, (v) => v.decorations);
    },
  });
}
