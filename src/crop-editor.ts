import { ImageTransform, getRotation, isCrop } from "./transforms";
import { snapAngle, snapScale, snapTranslate, toCropResult, CropResult } from "./crop-editor-logic";
import { BOX_CLASS } from "./renderer";
import { AnchoredSubmenu } from "./anchored-submenu";
import { t } from "./i18n";

interface Point { x: number; y: number; }

type AspectRatio = "free" | "16:9" | "4:3" | "1:1";

const ASPECT_RATIOS: Record<AspectRatio, number | null> = {
  "free": null, "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1,
};

// Parse the stored crop transform back into the editor's display-space state.
function parsePlacement(s?: string): { tx: number; ty: number; rotate: number; scale: number } {
  const out = { tx: 0, ty: 0, rotate: 0, scale: 1 };
  if (!s) return out;
  const re = /([a-zA-Z][\w-]*)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const args = (m[2] ?? "").split(",").map((a) => a.trim());
    if (m[1] === "translate") { out.tx = parseFloat(args[0] ?? "") || 0; out.ty = parseFloat(args[1] ?? "") || 0; }
    else if (m[1] === "rotate") out.rotate = parseFloat(args[0] ?? "") || 0;
    else if (m[1] === "scale") out.scale = parseFloat(args[0] ?? "") || 1;
  }
  return out;
}

/**
 * In-place crop editor (D8). The FRAME is the fixed output (the wrapper/box; its size
 * comes from the normal resize handle, its aspect from the presets) — it does NOT
 * resize via the handles. Instead you position the SOURCE IMAGE behind it: drag = pan,
 * wheel / corner-handle drag = scale (toward the frame centre), the rotate handle =
 * rotate (Bug 17). What the frame shows IS the committed result (Bug 19): the editor's
 * source image and the render share the box-width baseline + top-left convention. Snaps
 * live to whole pixels / 0.1° (F12). Aspect presets + confirm/cancel live in the shared
 * anchored sub-menu (D6/D8).
 */
export class CropEditor {
  private overlay: HTMLElement | null = null;
  private controls: AnchoredSubmenu | null = null;
  private img: HTMLImageElement;
  private onConfirm: (crop: CropResult) => void;
  private onCancel: () => void;
  private intrinsicRatio: number;

  private imgTranslate: Point = { x: 0, y: 0 };
  private imgScale = 1;
  private imgRotation = 0;

  // The fixed output frame (the box). frameW is the box-width baseline the render uses
  // for the inner image's `width: 100%`, so editor and result agree.
  private frameW = 0;
  private frameH = 0;
  private aspectRatio: AspectRatio = "free";

  // The "no crop" baseline captured on open, for the per-panel Reset.
  private initScale = 1;
  private initTranslate: Point = { x: 0, y: 0 };
  private initFrameH = 0;

  private isDraggingImage = false;
  private isScaling = false;
  private isRotating = false;
  private dragStart: Point = { x: 0, y: 0 };
  private dragStartTranslate: Point = { x: 0, y: 0 };
  private scaleStart = 1;
  private scaleStartDist = 1;

  constructor(
    img: HTMLImageElement,
    existing: ImageTransform,
    onConfirm: (crop: CropResult) => void,
    onCancel: () => void
  ) {
    this.img = img;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.intrinsicRatio = (img.naturalWidth || 1) / (img.naturalHeight || 1);

    const box = img.closest<HTMLElement>(`.${BOX_CLASS}`);
    const rect = (box ?? img).getBoundingClientRect();
    this.frameW = Math.round(rect.width);
    this.frameH = Math.round(rect.height);

    if (isCrop(existing)) {
      const p = parsePlacement(existing.transform);
      this.imgScale = p.scale;
      this.imgRotation = p.rotate || getRotation(existing);
      this.imgTranslate = {
        x: (p.tx / 100) * this.frameW,
        y: (p.ty / 100) * (this.frameW / this.intrinsicRatio),
      };
    }
    this.initScale = this.imgScale;
    this.initTranslate = { ...this.imgTranslate };
    this.initFrameH = this.frameH;
  }

  open(toolbarEl?: HTMLElement | null): void {
    const box = this.img.closest<HTMLElement>(`.${BOX_CLASS}`) ?? this.img;
    const rect = box.getBoundingClientRect();

    this.overlay = document.createElement("div");
    this.overlay.classList.add("lie-crop-overlay");
    this.overlay.innerHTML = this.buildHTML();
    const fc = this.overlay;
    fc.style.position = "fixed";
    fc.style.left = `${rect.left}px`;
    fc.style.top = `${rect.top}px`;
    fc.style.width = `${this.frameW}px`;
    fc.style.height = `${this.frameH}px`;
    document.body.appendChild(this.overlay);

    const src = this.overlay.querySelector<HTMLImageElement>(".lie-crop-source-img");
    if (src) src.style.width = `${this.frameW}px`; // scale 1 == the box-width baseline

    this.wrapper()?.classList.add("lie-cropping");

    this.bindEvents();
    this.openControls(toolbarEl);
    this.updateImageTransform();
    this.updateFrameSize();
  }

  private wrapper(): HTMLElement | null {
    return this.img.closest<HTMLElement>(".lie-wrapper, .image-embed");
  }

  close(): void {
    this.wrapper()?.classList.remove("lie-cropping");
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
        <div class="lie-crop-rotation-handle" data-handle="rotate"></div>
      </div>
    `;
  }

  private openControls(toolbarEl?: HTMLElement | null): void {
    const body = document.createElement("div");
    body.classList.add("lie-crop-presets");
    for (const ratio of Object.keys(ASPECT_RATIOS) as AspectRatio[]) {
      const btn = document.createElement("button");
      btn.classList.add("lie-crop-preset-btn");
      btn.textContent = ratio === "free" ? t("free") : ratio;
      btn.addEventListener("click", () => { this.aspectRatio = ratio; this.applyAspectRatio(); });
      body.appendChild(btn);
    }

    const controls = new AnchoredSubmenu();
    controls.open({
      body,
      placement: "under-toolbar",
      anchor: toolbarEl ?? this.img,
      toolbar: toolbarEl ?? null,
      title: t("crop"),
      onReset: () => this.resetCrop(),
      onCommit: () => this.confirm(),
      onCancel: () => { this.close(); this.onCancel(); },
      onClose: () => { this.controls = null; },
    });
    this.controls = controls;
  }

  // Reset only the crop placement (full image, no scale/pan/rotate); keep the frame.
  private resetCrop(): void {
    this.imgTranslate = { x: 0, y: 0 };
    this.imgRotation = 0;
    this.imgScale = 1;
    this.frameH = this.initFrameH;
    this.aspectRatio = "free";
    this.updateImageTransform();
    this.updateFrameSize();
  }

  private bindEvents(): void {
    if (!this.overlay) return;
    const sourceImg = this.overlay.querySelector(".lie-crop-source-img") as HTMLElement;
    const frame = this.overlay.querySelector(".lie-crop-frame") as HTMLElement;

    sourceImg.addEventListener("pointerdown", (e) => this.startImageDrag(e as PointerEvent));
    frame.addEventListener("pointerdown", (e) => this.startHandle(e as PointerEvent));
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);

    sourceImg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      this.scaleAround(snapScale(Math.max(0.05, Math.min(20, this.imgScale * delta))));
      this.updateImageTransform();
    });
  }

  // The frame centre, in overlay coordinates — the scale pivot (so zooming keeps the
  // framed region put).
  private frameCenter(): Point {
    return { x: this.frameW / 2, y: this.frameH / 2 };
  }

  // Scale the image to `newScale`, keeping the content under the frame centre fixed.
  private scaleAround(newScale: number): void {
    const c = this.frameCenter();
    const f = this.imgScale ? newScale / this.imgScale : 1;
    this.imgTranslate = snapTranslate(
      c.x - (c.x - this.imgTranslate.x) * f,
      c.y - (c.y - this.imgTranslate.y) * f
    );
    this.imgScale = newScale;
  }

  private startImageDrag(e: PointerEvent): void {
    e.preventDefault();
    this.isDraggingImage = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragStartTranslate = { ...this.imgTranslate };
  }

  // A handle drag SCALES the image (corner handles, Bug 17) or rotates it (rotate
  // handle); the frame itself stays fixed (it is the output).
  private startHandle(e: PointerEvent): void {
    const handle = (e.target as HTMLElement).dataset["handle"];
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = this.overlay?.querySelector(".lie-crop-frame");
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    this.dragStart = { x: e.clientX, y: e.clientY };
    if (handle === "rotate") {
      this.isRotating = true;
    } else {
      this.isScaling = true;
      this.scaleStart = this.imgScale;
      this.scaleStartDist = Math.max(1, Math.hypot(e.clientX - center.x, e.clientY - center.y));
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isRotating) {
      const frame = this.overlay?.querySelector(".lie-crop-frame");
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const angle = Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
      const startAngle = Math.atan2(this.dragStart.y - center.y, this.dragStart.x - center.x) * (180 / Math.PI);
      this.imgRotation = snapAngle(this.imgRotation + (angle - startAngle));
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.updateImageTransform();
    } else if (this.isScaling) {
      const frame = this.overlay?.querySelector(".lie-crop-frame");
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const dist = Math.max(1, Math.hypot(e.clientX - center.x, e.clientY - center.y));
      this.scaleAround(snapScale(Math.max(0.05, Math.min(20, this.scaleStart * (dist / this.scaleStartDist)))));
      this.updateImageTransform();
    } else if (this.isDraggingImage) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.imgTranslate = snapTranslate(this.dragStartTranslate.x + dx, this.dragStartTranslate.y + dy);
      this.updateImageTransform();
    }
  };

  private onPointerUp = (): void => {
    this.isDraggingImage = false;
    this.isScaling = false;
    this.isRotating = false;
  };

  // Aspect preset: reshape the frame (the output) keeping its WIDTH = the box-width
  // baseline, so the result's inner-image math stays consistent (Bug 19).
  private applyAspectRatio(): void {
    const ratio = ASPECT_RATIOS[this.aspectRatio];
    if (ratio) this.frameH = Math.round(this.frameW / ratio);
    this.updateFrameSize();
  }

  private updateImageTransform(): void {
    const img = this.overlay?.querySelector(".lie-crop-source-img") as HTMLElement | null;
    if (!img) return;
    img.style.transform = `translate(${this.imgTranslate.x}px, ${this.imgTranslate.y}px) rotate(${snapAngle(this.imgRotation)}deg) scale(${this.imgScale})`;
  }

  private updateFrameSize(): void {
    const frame = this.overlay?.querySelector(".lie-crop-frame") as HTMLElement | null;
    if (!frame) return;
    frame.style.width = `${this.frameW}px`;
    frame.style.height = `${this.frameH}px`;
    if (this.overlay) this.overlay.style.height = `${this.frameH}px`;
  }

  private confirm(): void {
    const result = toCropResult(
      this.imgTranslate,
      { w: this.frameW, h: this.frameH },
      this.imgRotation,
      this.imgScale,
      this.frameW,
      this.intrinsicRatio
    );
    this.wrapper()?.classList.remove("lie-cropping");
    this.overlay?.remove();
    this.overlay = null;
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    this.onConfirm(result);
  }
}
