import { t } from "./i18n";
import { AnchoredSubmenu } from "./anchored-submenu";
import { ContentBound } from "./anchored-submenu-logic";
import { filterClasses } from "./class-panel-logic";
import { editorToolbarOwner } from "./toolbar";

export interface ClassPanelCallbacks {
  // The class names currently applied (single image: its classes; multi: the classes ALL share).
  // Read freshly each refresh so the row "active" marks track the live source after every toggle.
  appliedClasses: () => string[];
  // Toggle `className` on the target(s) — the owner's existing apply/toggle write (one undo step).
  // The panel stays open and re-reads `appliedClasses()` to repaint the active marks.
  onToggle: (className: string) => void;
  // The panel element was removed — clear any reference the owner holds.
  onClose: () => void;
}

// The CSS-classes sub-panel (Bug 88): the old ad-hoc `.lie-class-dropdown` (absolute, wrong
// position) reworked into a proper sub-panel through the SHARED `AnchoredSubmenu` host — docked
// beside the image exactly like the filter panel (same toolbar-top anchor, pane-bound flip, greyed
// toolbar, hover region). The body is a search box over a scrollable list of the available classes;
// typing filters the list (`filterClasses`), clicking a row toggles that class on the image via the
// owner's existing write. Toggling is an immediate source write (kept from the old dropdown), so the
// host's commit/cancel have nothing to buffer — the panel is just a positioned, searchable picker.
export class ClassPanel {
  private submenu: AnchoredSubmenu | null = null;
  private list: HTMLElement | null = null;
  private available: string[];
  private callbacks: ClassPanelCallbacks;

  constructor(available: string[], callbacks: ClassPanelCallbacks) {
    this.available = available;
    this.callbacks = callbacks;
  }

  isOpen(): boolean {
    return this.submenu !== null;
  }

  // Open via the SHARED anchored sub-menu — the SAME options pattern as the filter panel (D8/D10):
  // beside the image, top-anchored to the toolbar, pane-bound flip, greyed toolbar, hover region.
  // `centeredTitle` switches to the STANDALONE multi-image mode (no anchor/toolbar/hover region,
  // centered, titled "N images") — mirrors FilterPanel.open.
  open(anchorEl: HTMLElement | null, toolbarEl?: HTMLElement | null, centeredTitle?: string): void {
    if (this.submenu) return;

    const body = activeDocument.createElement("div");
    body.classList.add("lie-class-body");
    body.appendChild(this.buildSearch());
    this.list = this.buildList();
    body.appendChild(this.list);
    this.renderList("");

    const submenu = new AnchoredSubmenu();
    submenu.open({
      body,
      placement: centeredTitle ? "centered" : "beside-image",
      anchor: centeredTitle ? undefined : anchorEl ?? undefined,
      toolbar: centeredTitle ? null : toolbarEl ?? null,
      title: centeredTitle ?? t("snippets"),
      rootClass: "lie-class-panel",
      allowFlip: !centeredTitle,
      contentBound: centeredTitle ? undefined : () => this.editorPaneBound(anchorEl),
      hideWhenAnchorOffscreen: !centeredTitle,
      hoverRegion: centeredTitle || !anchorEl
        ? undefined
        : anchorEl.closest<HTMLElement>(".lie-wrapper") ?? editorToolbarOwner(anchorEl) ?? undefined,
      // Toggling writes immediately (kept from the old dropdown), so accept/cancel have nothing to
      // buffer — both just tear the panel down. No onReset: a class panel has no working state.
      onCommit: () => {},
      onCancel: () => {},
      onClose: () => { this.submenu = null; this.list = null; this.callbacks.onClose(); },
    });
    this.submenu = submenu;
  }

  // Leave the panel (default persist — accept/leave); `persist=false` is the silent unload teardown.
  // Idempotent (AnchoredSubmenu guards double-fire). Toggling already wrote the source, so the exit
  // reason only governs the host teardown, not a source write.
  close(persist = true): void {
    this.submenu?.close(persist ? "commit" : "silent");
  }

  // The horizontal bound the side-of-more-room flip is measured against (Bug 77/D7): the editor
  // content pane that holds the image, EXCLUDING the left sidebar — identical to the filter panel.
  private editorPaneBound(anchorEl: HTMLElement | null): ContentBound | null {
    const pane = anchorEl?.closest<HTMLElement>(".markdown-source-view");
    if (!pane) return null;
    const r = pane.getBoundingClientRect();
    return { left: r.left, right: r.right };
  }

  private buildSearch(): HTMLElement {
    const input = activeDocument.createElement("input");
    input.type = "text";
    input.classList.add("lie-class-search");
    input.placeholder = t("searchClasses");
    input.setAttribute("aria-label", t("searchClasses"));
    input.addEventListener("input", () => this.renderList(input.value));
    return input;
  }

  private buildList(): HTMLElement {
    const list = activeDocument.createElement("div");
    list.classList.add("lie-class-list");
    return list;
  }

  // (Re)build the rows from the available classes filtered by the search query, marking each row
  // active when the class is currently applied (read freshly so it tracks the live source). The
  // empty-search case shows every available class; the no-match case shows a muted message.
  private renderList(query: string): void {
    if (!this.list) return;
    this.list.empty();
    const applied = this.callbacks.appliedClasses();
    const matches = filterClasses(this.available, query);

    if (matches.length === 0) {
      const empty = activeDocument.createElement("div");
      empty.classList.add("lie-class-empty");
      empty.textContent = t("noMatchingClasses");
      this.list.appendChild(empty);
      return;
    }

    for (const className of matches) {
      const row = activeDocument.createElement("button");
      row.classList.add("lie-class-item");
      if (applied.includes(className)) row.classList.add("is-active");
      row.textContent = className;
      // Keep editor focus so the toggle's source write stays one native undo step (mirrors the
      // toolbar buttons), and stop propagation so the click never reaches the click-away dismiss.
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onToggle(className);
        this.renderList(query); // repaint the active marks against the just-written source
      });
      this.list.appendChild(row);
    }
  }
}
