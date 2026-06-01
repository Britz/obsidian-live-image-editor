import { CropData } from "./transforms";
import { snapAngle, snapScale, snapTranslate, toCropData } from "./crop-editor-logic";
import { AnchoredSubmenu } from "./anchored-submenu";
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

/**
 * In-place crop editor (D11): the crop UI overlays the image at its exact current
 * position/size — no jump, no centered modal, no full-page dialog. The original
 * shows under a resizable frame (semi-transparent outside, full opacity inside);
 * it can be dragged, rotated, scaled and the frame resized, all snapping live to
 * whole pixels / 0.1° (F7). The aspect presets + confirm/cancel live in the shared
 * anchored sub-menu under the toolbar (D8/D10/T9), which greys the toolbar.
 */
export class CropEditor {
  private overlay: HTMLElement | null = null;
  private controls: AnchoredSubmenu | null = null;
  private img: HTMLImageElement;
  private onConfirm: (crop: CropData) => void;
  private onCancel: () => void;

  private imgTranslate: Point = { x: 0, y: 0 };
  private imgScale = 1;
  private imgRotation = 0;

  private frameWidth = 0;
  private frameHeight = 0;
  private aspectRatio: AspectRatio = "free";
  private hasExistingCrop: boolean;

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
    this.hasExistingCrop = !!existingCrop;

    if (existingCrop) {
      this.imgTranslate = { x: -existingCrop.x, y: -existingCrop.y };
      this.imgRotation = existingCrop.rotate;
      this.imgScale = existingCrop.scale;
      this.frameWidth = existingCrop.w;
      this.frameHeight = existingCrop.h;
    }
  }

  open(toolbarEl?: HTMLElement | null): void {
    const rect = this.img.getBoundingClientRect();

    // No existing crop: start with the frame covering the whole displayed image
    // and the source scaled to match it exactly — so activation causes no jump.
    if (!this.hasExistingCrop) {
      this.frameWidth = Math.round(rect.width);
      this.frameHeight = Math.round(rect.height);
      this.imgScale = snapScale(rect.width / (this.img.naturalWidth || rect.width));
    }

    this.overlay = document.createElement("div");
    this.overlay.classList.add("lie-crop-overlay");
    this.overlay.innerHTML = this.buildHTML();
    // Position the workspace OVER the image, in place (D11).
    const fc = this.overlay as HTMLElement;
    fc.style.position = "fixed";
    fc.style.left = `${rect.left}px`;
    fc.style.top = `${rect.top}px`;
    fc.style.width = `${rect.width}px`;
    fc.style.height = `${rect.height}px`;
    document.body.appendChild(this.overlay);

    this.bindEvents();
    this.openControls(toolbarEl);
    this.updateImageTransform();
    this.updateFrameSize();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    this.controls?.close("cancel");
  }

  private buildHTML(): string {
    return `
      <div class="lie-crop-image-layer">
        <img src="${this.img.src}" class="lie-crop-source-img" draggable="false">
      </div>
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
    `;
  }

  // The aspect presets + confirm/cancel as the shared anchored sub-menu (D8/D10/T9):
  // compact, under the toolbar, greyed toolbar, icon confirm/cancel, Esc = cancel.
  private openControls(toolbarEl?: HTMLElement | null): void {
    const body = document.createElement("div");
    body.classList.add("lie-crop-presets");
    for (const ratio of Object.keys(ASPECT_RATIOS) as AspectRatio[]) {
      const btn = document.createElement("button");
      btn.classList.add("lie-crop-preset-btn");
      btn.textContent = ratio === "free" ? t("free") : ratio;
      btn.addEventListener("click", () => {
        this.aspectRatio = ratio;
        this.applyAspectRatio();
      });
      body.appendChild(btn);
    }

    const controls = new AnchoredSubmenu();
    controls.open({
      body,
      placement: "under-toolbar",
      anchor: toolbarEl ?? this.img,
      toolbar: toolbarEl ?? null,
      title: t("crop"),
      onCommit: () => this.confirm(),
      onCancel: () => { this.close(); this.onCancel(); },
      onClose: () => { this.controls = null; },
    });
    this.controls = controls;
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    const sourceImg = this.overlay.querySelector(".lie-crop-source-img") as HTMLElement;
    const frame = this.overlay.querySelector(".lie-crop-frame") as HTMLElement;

    sourceImg.addEventListener("pointerdown", (e) => this.startImageDrag(e as PointerEvent));
    frame.addEventListener("pointerdown", (e) => this.startFrameInteraction(e as PointerEvent));

    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);

    sourceImg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      this.imgScale = snapScale(Math.max(0.1, Math.min(10, this.imgScale * delta)));
      this.updateImageTransform();
    });
  }

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
      // Snap rotation to 0.1° steps LIVE (F7) so the cut never falls mid-angle.
      this.imgRotation = snapAngle(this.imgRotation + (angle - startAngle));
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.updateImageTransform();
    } else if (this.isDraggingImage) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      // Snap position to whole pixels LIVE (F7) so the cut never falls mid-pixel.
      this.imgTranslate = snapTranslate(this.dragStartTranslate.x + dx, this.dragStartTranslate.y + dy);
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
    img.style.transform = `translate(${this.imgTranslate.x}px, ${this.imgTranslate.y}px) rotate(${snapAngle(this.imgRotation)}deg) scale(${this.imgScale})`;
  }

  private updateFrameSize(): void {
    const frame = this.overlay?.querySelector(".lie-crop-frame") as HTMLElement | null;
    if (!frame) return;
    frame.style.width = `${this.frameWidth}px`;
    frame.style.height = `${this.frameHeight}px`;
  }

  private confirm(): void {
    const cropData: CropData = toCropData(
      this.imgTranslate,
      { w: this.frameWidth, h: this.frameHeight },
      this.imgRotation,
      this.imgScale
    );
    this.overlay?.remove();
    this.overlay = null;
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    this.onConfirm(cropData);
  }
}
