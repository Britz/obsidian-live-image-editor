import { setIcon } from "obsidian";
import { t, TranslationKey } from "./i18n";

export interface ToolbarAction {
  icon: string;
  titleKey: TranslationKey;
  action: () => void;
}

export class ImageToolbar {
  private el: HTMLElement | null = null;
  private activeImg: HTMLImageElement | null = null;

  show(img: HTMLImageElement, actions: ToolbarAction[]): void {
    this.hide();
    this.activeImg = img;

    const toolbar = document.createElement("div");
    toolbar.classList.add("lie-toolbar");

    for (const { icon, titleKey, action } of actions) {
      const btn = document.createElement("button");
      btn.classList.add("lie-toolbar-btn");
      btn.setAttribute("aria-label", t(titleKey));
      btn.title = t(titleKey);
      setIcon(btn, icon);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        action();
      });
      toolbar.appendChild(btn);
    }

    this.positionAboveImage(toolbar, img);
    document.body.appendChild(toolbar);
    this.el = toolbar;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.activeImg = null;
  }

  isVisible(): boolean {
    return this.el !== null;
  }

  getActiveImage(): HTMLImageElement | null {
    return this.activeImg;
  }

  private positionAboveImage(toolbar: HTMLElement, img: HTMLImageElement): void {
    const rect = img.getBoundingClientRect();
    toolbar.style.position = "fixed";
    toolbar.style.top = `${rect.top - 44}px`;
    toolbar.style.left = `${rect.left + rect.width / 2}px`;
    toolbar.style.transform = "translateX(-50%)";
    toolbar.style.zIndex = "1000";
  }
}
