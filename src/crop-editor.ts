import { CropData } from "./transforms";
import { t } from "./i18n";

interface Point {
  x: number;
  y: number;
}

type AspectRatio = "free" | "16:9" | "4:3" | "1:1";

const ASPECT_RATIOS: Record<AspectRatio, number | null> = {
  "free": null,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
};

export class CropEditor {
  private overlay: HTMLElement | null = null;
  private img: HTMLImageElement;
  private onConfirm: (crop: CropData) => void;
  private onCancel: () => void;

  private imgTranslate: Point = { x: 0, y: 0 };
  private imgScale = 1;
  private imgRotation = 0;

  private frameWidth: number;
  private frameHeight: number;
  private aspectRatio: AspectRatio = "free";

  private isDraggingImage = false;
  private isResizingFrame = false;
  private resizeHandle = "";
  private dragStart: Point = { x: 0, y: 0 };
  private dragStartTranslate: Point = { x: 0, y: 0 };
  private dragStartSize = { w: 0, h: 0 };

  constructor(
    img: HTMLImageElement,
    existingCrop: CropData | undefined,
    onConfirm: (crop: CropData) => void,
    onCancel: () => void
  ) {
    this.img = img;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    if (existingCrop) {
      this.imgTranslate = { x: -existingCrop.x, y: -existingCrop.y };
      this.imgRotation = existingCrop.rotate;
      this.imgScale = existingCrop.scale;
      this.frameWidth = existingCrop.w;
      this.frameHeight = existingCrop.h;
    } else {
      this.frameWidth = Math.min(img.naturalWidth, 400);
      this.frameHeight = Math.min(img.naturalHeight, 300);
    }
  }

  open(): void {
    this.overlay = document.createElement("div");
    this.overlay.classList.add("lie-crop-overlay");
    this.overlay.innerHTML = this.buildHTML();
    document.body.appendChild(this.overlay);

    this.bindEvents();
    this.updateImageTransform();
    this.updateFrameSize();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private buildHTML(): string {
    return `
      <div class="lie-crop-backdrop"></div>
      <div class="lie-crop-workspace">
        <div class="lie-crop-frame-container">
          <div class="lie-crop-image-layer">
            <img src="${this.img.src}" class="lie-crop-source-img" draggable="false">
          </div>
          <div class="lie-crop-mask"></div>
          <div class="lie-crop-frame">
            <div class="lie-crop-handle lie-crop-handle-nw" data-handle="nw"></div>
            <div class="lie-crop-handle lie-crop-handle-ne" data-handle="ne"></div>
            <div class="lie-crop-handle lie-crop-handle-sw" data-handle="sw"></div>
            <div class="lie-crop-handle lie-crop-handle-se" data-handle="se"></div>
            <div class="lie-crop-handle lie-crop-handle-n" data-handle="n"></div>
            <div class="lie-crop-handle lie-crop-handle-s" data-handle="s"></div>
            <div class="lie-crop-handle lie-crop-handle-e" data-handle="e"></div>
            <div class="lie-crop-handle lie-crop-handle-w" data-handle="w"></div>
            <div class="lie-crop-rotation-handle" data-handle="rotate"></div>
          </div>
        </div>
        <div class="lie-crop-controls">
          <div class="lie-crop-presets">
            <button class="lie-crop-preset-btn" data-ratio="free">Free</button>
            <button class="lie-crop-preset-btn" data-ratio="16:9">16:9</button>
            <button class="lie-crop-preset-btn" data-ratio="4:3">4:3</button>
            <button class="lie-crop-preset-btn" data-ratio="1:1">1:1</button>
          </div>
          <div class="lie-crop-actions">
            <button class="lie-crop-confirm">${t("apply")}</button>
            <button class="lie-crop-cancel">${t("cancel")}</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    const sourceImg = this.overlay.querySelector(".lie-crop-source-img") as HTMLElement;
    const frame = this.overlay.querySelector(".lie-crop-frame") as HTMLElement;
    const confirmBtn = this.overlay.querySelector(".lie-crop-confirm") as HTMLElement;
    const cancelBtn = this.overlay.querySelector(".lie-crop-cancel") as HTMLElement;

    sourceImg.addEventListener("pointerdown", (e) => this.startImageDrag(e));
    frame.addEventListener("pointerdown", (e) => this.startFrameInteraction(e));

    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);

    confirmBtn.addEventListener("click", () => this.confirm());
    cancelBtn.addEventListener("click", () => { this.close(); this.onCancel(); });

    sourceImg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      this.imgScale = Math.max(0.1, Math.min(10, this.imgScale * delta));
      this.updateImageTransform();
    });

    const presetBtns = this.overlay.querySelectorAll(".lie-crop-preset-btn");
    for (const btn of Array.from(presetBtns)) {
      btn.addEventListener("click", () => {
        this.aspectRatio = (btn as HTMLElement).dataset["ratio"] as AspectRatio;
        this.applyAspectRatio();
      });
    }

    document.addEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") { this.confirm(); }
    if (e.key === "Escape") { this.close(); this.onCancel(); }
  };

  private startImageDrag(e: PointerEvent): void {
    e.preventDefault();
    this.isDraggingImage = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragStartTranslate = { ...this.imgTranslate };
  }

  private startFrameInteraction(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    const handle = target.dataset["handle"];
    if (!handle) return;

    e.preventDefault();
    e.stopPropagation();

    if (handle === "rotate") {
      this.isDraggingImage = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.resizeHandle = "rotate";
    } else {
      this.isResizingFrame = true;
      this.resizeHandle = handle;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragStartSize = { w: this.frameWidth, h: this.frameHeight };
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isDraggingImage && this.resizeHandle === "rotate") {
      const frame = this.overlay?.querySelector(".lie-crop-frame");
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const angle = Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
      const startAngle = Math.atan2(this.dragStart.y - center.y, this.dragStart.x - center.x) * (180 / Math.PI);
      this.imgRotation += angle - startAngle;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.updateImageTransform();
    } else if (this.isDraggingImage) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.imgTranslate = {
        x: this.dragStartTranslate.x + dx,
        y: this.dragStartTranslate.y + dy,
      };
      this.updateImageTransform();
    } else if (this.isResizingFrame) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.resizeFrame(dx, dy);
    }
  };

  private onPointerUp = (): void => {
    this.isDraggingImage = false;
    this.isResizingFrame = false;
    this.resizeHandle = "";
  };

  private resizeFrame(dx: number, dy: number): void {
    const handle = this.resizeHandle;
    let newW = this.dragStartSize.w;
    let newH = this.dragStartSize.h;

    if (handle.includes("e")) newW += dx;
    if (handle.includes("w")) newW -= dx;
    if (handle.includes("s")) newH += dy;
    if (handle.includes("n")) newH -= dy;

    newW = Math.max(50, newW);
    newH = Math.max(50, newH);

    const ratio = ASPECT_RATIOS[this.aspectRatio];
    if (ratio) {
      if (handle.includes("e") || handle.includes("w")) {
        newH = Math.round(newW / ratio);
      } else {
        newW = Math.round(newH * ratio);
      }
    }

    this.frameWidth = Math.round(newW);
    this.frameHeight = Math.round(newH);
    this.updateFrameSize();
  }

  private applyAspectRatio(): void {
    const ratio = ASPECT_RATIOS[this.aspectRatio];
    if (ratio) {
      this.frameHeight = Math.round(this.frameWidth / ratio);
      this.updateFrameSize();
    }
  }

  private updateImageTransform(): void {
    const img = this.overlay?.querySelector(".lie-crop-source-img") as HTMLElement | null;
    if (!img) return;
    img.style.transform = `translate(${this.imgTranslate.x}px, ${this.imgTranslate.y}px) rotate(${Math.round(this.imgRotation * 10) / 10}deg) scale(${this.imgScale})`;
  }

  private updateFrameSize(): void {
    const frame = this.overlay?.querySelector(".lie-crop-frame") as HTMLElement | null;
    const mask = this.overlay?.querySelector(".lie-crop-mask") as HTMLElement | null;
    const container = this.overlay?.querySelector(".lie-crop-frame-container") as HTMLElement | null;
    if (!frame || !mask || !container) return;

    frame.style.width = `${this.frameWidth}px`;
    frame.style.height = `${this.frameHeight}px`;
  }

  private confirm(): void {
    const cropData: CropData = {
      x: Math.round(-this.imgTranslate.x),
      y: Math.round(-this.imgTranslate.y),
      w: Math.round(this.frameWidth),
      h: Math.round(this.frameHeight),
      rotate: Math.round(this.imgRotation * 10) / 10,
      scale: Math.round(this.imgScale * 1000) / 1000,
    };

    this.close();
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    document.removeEventListener("keydown", this.onKeyDown);
    this.onConfirm(cropData);
  }
}
