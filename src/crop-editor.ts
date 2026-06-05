import { ImageTransform, isCrop, getRotation, getFlipH, getFlipV } from "./transforms";
import { snapAngle, snapScale, snapTranslate, toCropResult, parsePlacement, applyRotateGesture, CropResult } from "./crop-editor-logic";
import { BOX_CLASS, FRAME_CLASS, buildLayers } from "./render-core";
import { AnchoredSubmenu } from "./anchored-submenu";
import { t } from "./i18n";

interface Point { x: number; y: number; }

type AspectRatio = "free" | "16:9" | "4:3" | "1:1";

const ASPECT_RATIOS: Record<AspectRatio, number | null> = {
  "free": null, "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1,
};

// All eight resize handles (D8): four CORNER (aspect-locked) + four EDGE (single-axis). The rotate
// knob is separate. The class suffix is the `data-handle` token; `axis` is which scale axis a drag
// drives — "both" (aspect-locked corner), "x" (e/w edge) or "y" (n/s edge).
const HANDLES: { key: string; axis: "both" | "x" | "y" }[] = [
  { key: "nw", axis: "both" }, { key: "ne", axis: "both" },
  { key: "sw", axis: "both" }, { key: "se", axis: "both" },
  { key: "n", axis: "y" }, { key: "s", axis: "y" },
  { key: "e", axis: "x" }, { key: "w", axis: "x" },
];

// Gesture sensitivity (Bug-32 H — tunable; the user verifies the FEEL). In-place, screen px == content
// px, so PAN stays 1:1; only ZOOM is damped (raw deltas jump). One named constant per zoom source so
// a feel tweak is a single edit: the mouse wheel (±~100 deltaY per notch) and the trackpad pinch
// (a wheel event with ctrlKey, small deltaY) want different multipliers.
const WHEEL_ZOOM_PER_PX = 0.0015;   // mouse-wheel scroll → scale-factor change per deltaY unit
const PINCH_ZOOM_PER_PX = 0.01;     // trackpad pinch (wheel + ctrlKey) → scale-factor change per deltaY unit

/**
 * In-place crop editor (D8/AD3). Operates on the LIVE 3-layer DOM — outer `.lie-image-area`
 * (footprint) → `.lie-frame` (cut clip + orientation) → `<img>` (the placement) — NOT a clone:
 * the preview IS the live image, re-derived from the SAME geometry the render core commits, so
 * preview == committed by construction (Bug-32 A/B/C). The user moves / scales / rotates the
 * ORIGINAL image under a FIXED cut window: drag = pan, wheel / corner-handle = aspect-locked
 * scale, edge-handle = single-axis scale, the rotate knob = rotate — all about the cut CENTRE
 * (mirroring render-core's `transform-origin:center`), quantized LIVE to whole px / 0.1° (F12).
 * The cut SHAPE changes only via the aspect presets; the box footprint and the cut window stay
 * fixed during the session (box size is changed OUTSIDE crop — the native handle D4 / size menu
 * F24). For the crop duration the frame/area `overflow:hidden` is lifted and the host
 * `contain:paint` (LP block widget) worked around, so the whole image overflows the window with
 * the outside DIMMED and the inside full — no jump or reflow (the footprint stays reserved).
 * Auto-persist (AD8/D6): no accept/cancel — leaving the shared host persists the session ONCE.
 */
export class CropEditor {
  private controls: AnchoredSubmenu | null = null;
  private img: HTMLImageElement;
  private existing: ImageTransform;
  private persist: (result: CropResult | null) => void;
  private onClosed: () => void;
  private intrinsicRatio: number;
  private orientDeg = 0;

  // Working state in the PLACEMENT space (mirrors render-core's crop branch). translate is display
  // px over the cut frame (serialized to % by toCropResult), rotate the CONTENT rotate (distinct
  // from the frame orientation, which the editor leaves alone — Bug 25), scaleX/scaleY the per-axis
  // zoom (corner = both, edge = one).
  private tx = 0;
  private ty = 0;
  private rotation = 0;
  private scaleX = 1;
  private scaleY = 1;

  // The cut frame in display px. The WIDTH is the cut-frame baseline (fixed); the HEIGHT changes
  // only via the aspect presets. Captured from the live frame's layout box on open.
  private frameW = 0;
  private frameH = 0;
  private aspectRatio: AspectRatio = "free";

  // The "no crop" baseline captured on open, for the per-panel Reset.
  private initFrameH = 0;
  // Any gesture / preset / reset marks the session dirty; an untouched open→leave persists nothing.
  private dirty = false;

  // The live layers + the transient chrome the editor injects for the crop duration.
  private frameEl: HTMLElement | null = null;
  private areaEl: HTMLElement | null = null;
  private hostEl: HTMLElement | null = null;
  private ghostFrame: HTMLElement | null = null;
  private ghostImg: HTMLImageElement | null = null;
  private chromeFrame: HTMLElement | null = null;
  private handleBox: HTMLElement | null = null;

  // macOS trackpad two-finger rotate (Electron `rotate-gesture`, electron/electron#19294).
  // Subscribed on open, removed on EVERY teardown path — both null off macOS / when `@electron/
  // remote` is unreachable, where the rotate handle stays the only rotation. The stored handler
  // reference is what `removeListener` needs to detach the exact same listener (no leak).
  private gestureWin: ElectronRotateWindow | null = null;
  private onRotateGesture: ((...args: unknown[]) => void) | null = null;

  private gesture: "pan" | "scale" | "rotate" | null = null;
  private scaleAxis: "both" | "x" | "y" = "both";
  private dragStart: Point = { x: 0, y: 0 };
  private startTx = 0;
  private startTy = 0;
  private startScaleX = 1;
  private startScaleY = 1;
  private startDist = 1;   // corner (aspect-locked): diagonal distance from the cut centre
  private startDistX = 1;  // edge e/w (single-axis): horizontal distance from the cut centre
  private startDistY = 1;  // edge n/s (single-axis): vertical distance from the cut centre

  constructor(
    img: HTMLImageElement,
    existing: ImageTransform,
    persist: (result: CropResult | null) => void,
    onClosed: () => void
  ) {
    this.img = img;
    this.existing = existing;
    this.persist = persist;
    this.onClosed = onClosed;
    this.intrinsicRatio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  }

  open(toolbarEl?: HTMLElement | null, anchorEl?: HTMLElement | null): void {
    const frame = this.img.closest<HTMLElement>(`.${FRAME_CLASS}`);
    const area = this.img.closest<HTMLElement>(`.${BOX_CLASS}`);
    if (!frame || !area) { this.onClosed(); return; } // not our 3-layer structure — release the ref
    this.frameEl = frame;
    this.areaEl = area;
    this.hostEl = this.img.closest<HTMLElement>(".lie-wrapper, .image-embed") ?? area;

    // The cut-frame baseline: its LAYOUT box (pre-orientation), not the rotated on-screen AABB.
    this.frameW = Math.max(1, Math.round(frame.offsetWidth));
    this.frameH = Math.max(1, Math.round(frame.offsetHeight));
    this.initFrameH = this.frameH;
    this.orientDeg = getRotation(this.existing);

    if (isCrop(this.existing)) {
      const p = parsePlacement(this.existing.transform, this.frameW, this.intrinsicRatio);
      this.tx = p.tx; this.ty = p.ty; this.rotation = p.rotate;
      this.scaleX = p.scaleX; this.scaleY = p.scaleY;
    }

    this.enterCropMode();
    this.bindEvents();
    this.openControls(toolbarEl, anchorEl);
    this.applyPlacement();
  }

  // Leave the editor; under auto-persist this persists the session (one undo step). `persist=false`
  // is the silent teardown for plugin unload.
  close(persist = true): void {
    this.controls?.close(persist);
  }

  // ---- In-place mode: un-clip the live structure, draw the dim-outside ghost + handles ---------

  private enterCropMode(): void {
    const { areaEl: area, frameEl: frame, hostEl: host } = this;
    if (!area || !frame || !host) return;

    // Un-clip so the whole image overflows the cut window (the footprint box still reserves its
    // space → no reflow). The cut `.lie-frame` KEEPS its own overflow:hidden (it is the bright cut);
    // only the OUTER area is opened so the dim ghost can extend beyond the footprint.
    area.classList.add("lie-cropping");
    area.style.overflow = "visible";
    area.style.zIndex = "5";
    // The host (LP block widget) paint-contains its content — app.css `.cm-content >
    // [contenteditable="false"] { contain: paint }` is `!important`, so it must be beaten with
    // `!important` or the overflow is re-clipped to the widget box. Lifted for the crop duration
    // only; harmless where there is no containment.
    host.classList.add("lie-cropping");
    host.style.setProperty("contain", "none", "important");

    // Pin the cut frame at its current px box so the aspect presets reshape ONLY the cut (the
    // footprint derives from --lie-auto-aspect and is untouched until commit → box stays fixed).
    frame.style.width = `${this.frameW}px`;
    frame.style.height = `${this.frameH}px`;
    // Crop layout for the live (bright) img: centred, width:100% of the frame, height:auto, centre
    // pivot — identical to render-core's crop branch, so the live img reads back == it renders.
    this.styleAsCropImg(this.img);

    const orient = this.orientationTransform();

    // DIM ghost (behind): a clone of the image, un-clipped, dimmed — shows the croppable surround.
    const ghostFrame = this.makeFrameBox(orient);
    ghostFrame.classList.add("lie-crop-ghost");
    const ghostImg = document.createElement("img");
    ghostImg.className = "lie-crop-ghost-img";
    ghostImg.src = this.img.src;
    ghostImg.draggable = false;
    this.styleAsCropImg(ghostImg);
    ghostFrame.appendChild(ghostImg);
    area.insertBefore(ghostFrame, area.firstChild);
    this.ghostFrame = ghostFrame; this.ghostImg = ghostImg;

    // CHROME (on top): the white handle frame on the ORIGINAL image + the rotate knob. The frame
    // box is pointer-transparent (so a drag on the image background pans); only the handles catch.
    const chromeFrame = this.makeFrameBox(orient);
    chromeFrame.classList.add("lie-crop-chrome");
    const handleBox = document.createElement("div");
    handleBox.className = "lie-crop-handles";
    handleBox.style.width = `${this.frameW}px`;
    handleBox.style.height = `${this.imgDisplayH()}px`;
    for (const h of HANDLES) {
      const el = document.createElement("div");
      el.className = `lie-crop-handle lie-crop-handle-${h.key}`;
      el.dataset["handle"] = h.key;
      handleBox.appendChild(el);
    }
    const rotateKnob = document.createElement("div");
    rotateKnob.className = "lie-crop-rotation-handle";
    rotateKnob.dataset["handle"] = "rotate";
    handleBox.appendChild(rotateKnob);
    chromeFrame.appendChild(handleBox);
    area.appendChild(chromeFrame);
    this.chromeFrame = chromeFrame; this.handleBox = handleBox;
  }

  private exitCropMode(): void {
    this.ghostFrame?.remove();
    this.chromeFrame?.remove();
    this.ghostFrame = this.ghostImg = this.chromeFrame = this.handleBox = null;
    // Clear only what buildLayers does NOT own: the crop-active classes (on area + host) and the
    // host's lifted `contain`. The transient inline geometry (area overflow / z-index, the px frame
    // box) is owned by buildLayers — a committed leave already re-rendered it; a NO-OP leave
    // re-renders here to restore the clean committed geometry. Either way no stale style lingers.
    this.areaEl?.classList.remove("lie-cropping");
    this.hostEl?.classList.remove("lie-cropping");
    this.hostEl?.style.removeProperty("contain");
    this.areaEl?.removeEventListener("pointerdown", this.onPointerDown);
    this.areaEl?.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    // Detach the macOS rotate gesture (exact same handler ref) — this is the ONE teardown the
    // single onClose runs on every exit path, so confirm + cancel/Esc/close all unsubscribe here.
    if (this.gestureWin && this.onRotateGesture) {
      this.gestureWin.removeListener("rotate-gesture", this.onRotateGesture);
    }
    this.gestureWin = null;
    this.onRotateGesture = null;
    if (!this.dirty) buildLayers(this.img, this.existing);
  }

  // The cut-frame positioning box (top/left 50%, centred + oriented like the live `.lie-frame`),
  // sized to the cut window; overflow visible so the image inside shows beyond the cut.
  private makeFrameBox(orient: string): HTMLElement {
    const box = document.createElement("div");
    box.style.position = "absolute";
    box.style.top = "50%";
    box.style.left = "50%";
    box.style.width = `${this.frameW}px`;
    box.style.height = `${this.frameH}px`;
    box.style.transform = orient;
    box.style.transformOrigin = "center";
    return box;
  }

  // Centre an image inside a frame box exactly as render-core's crop branch does (so the ghost and
  // the handle box track the live img precisely): absolute, inset 0 + margin auto, width:100% /
  // height:auto, centre pivot.
  private styleAsCropImg(img: HTMLElement): void {
    img.style.position = "absolute";
    img.style.top = "0"; img.style.left = "0"; img.style.right = "0"; img.style.bottom = "0";
    img.style.margin = "auto";
    img.style.transformOrigin = "center";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.maxWidth = "none";
  }

  // The frame orientation (rotate + flip about the centre) — the SAME string render-core writes,
  // so the chrome/ghost overlay the live oriented frame. The editor never EDITS it (Bug 25).
  private orientationTransform(): string {
    const parts = ["translate(-50%, -50%)"];
    if (this.orientDeg) parts.push(`rotate(${this.orientDeg}deg)`);
    if (getFlipH(this.existing)) parts.push("scaleX(-1)");
    if (getFlipV(this.existing)) parts.push("scaleY(-1)");
    return parts.join(" ");
  }

  private imgDisplayH(): number {
    return this.frameW / (this.intrinsicRatio > 0 ? this.intrinsicRatio : 1);
  }

  // ---- The shared sub-menu host (aspect presets + Reset) ---------------------------------------

  private openControls(toolbarEl?: HTMLElement | null, anchorEl?: HTMLElement | null): void {
    const body = document.createElement("div");
    body.classList.add("lie-crop-presets");
    for (const ratio of Object.keys(ASPECT_RATIOS) as AspectRatio[]) {
      const btn = document.createElement("button");
      btn.classList.add("lie-crop-preset-btn");
      btn.textContent = ratio === "free" ? t("free") : ratio;
      btn.addEventListener("click", () => { this.aspectRatio = ratio; this.applyAspectRatio(); });
      body.appendChild(btn);
    }

    const anchor = toolbarEl ?? anchorEl ?? this.img;
    const controls = new AnchoredSubmenu();
    controls.open({
      body,
      placement: "under-toolbar",
      anchor,
      toolbar: toolbarEl ?? null,
      title: t("crop"),
      hoverRegion: this.img.closest<HTMLElement>(".lie-wrapper") ?? undefined,
      onReset: () => this.resetCrop(),
      // Auto-persist (AD8): leaving the host persists the session ONCE — and only if it was
      // actually touched (an untouched open→leave writes nothing). Teardown always runs onClose.
      onCommit: () => { if (this.dirty) this.persist(this.toResult()); },
      onClose: () => { this.exitCropMode(); this.controls = null; this.onClosed(); },
    });
    this.controls = controls;
  }

  // Reset only the crop placement (full image, no scale/pan/rotate, original aspect); keep the box.
  private resetCrop(): void {
    this.tx = 0; this.ty = 0; this.rotation = 0; this.scaleX = 1; this.scaleY = 1;
    this.frameH = this.initFrameH;
    this.aspectRatio = "free";
    this.dirty = true;
    this.applyFrameSize();
    this.applyPlacement();
  }

  // Aspect preset: reshape the CUT window keeping its WIDTH baseline (so the placement math stays
  // consistent); the footprint box is untouched until commit (box stays fixed during the session).
  private applyAspectRatio(): void {
    const ratio = ASPECT_RATIOS[this.aspectRatio];
    if (ratio) this.frameH = Math.max(1, Math.round(this.frameW / ratio));
    this.dirty = true;
    this.applyFrameSize();
  }

  private applyFrameSize(): void {
    if (this.frameEl) this.frameEl.style.height = `${this.frameH}px`;
    if (this.ghostFrame) this.ghostFrame.style.height = `${this.frameH}px`;
    if (this.chromeFrame) this.chromeFrame.style.height = `${this.frameH}px`;
  }

  // ---- Gestures --------------------------------------------------------------------------------

  private bindEvents(): void {
    const area = this.areaEl;
    if (!area) return;
    area.addEventListener("pointerdown", this.onPointerDown);
    area.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);
    this.bindRotateGesture();
  }

  // Subscribe the native macOS two-finger trackpad rotate, if reachable (Phase-0-verified path).
  // Each `rotate-gesture` delta updates the CONTENT rotation (snapped, about the cut centre) and
  // re-previews — the exact same effect as the rotate handle, which stays the fallback. No-op off
  // macOS / no Electron remote: nothing subscribed, the handle is the only rotation path.
  private bindRotateGesture(): void {
    const win = macTrackpadWindow();
    if (!win) return;
    const handler = (...args: unknown[]): void => {
      const delta = args[1];
      if (typeof delta !== "number" || delta === 0) return; // last emission is 0 — ignore
      this.rotation = applyRotateGesture(this.rotation, delta);
      this.dirty = true;
      this.applyPlacement();
    };
    win.on("rotate-gesture", handler);
    this.gestureWin = win;
    this.onRotateGesture = handler;
  }

  private frameCenter(): Point {
    const r = (this.frameEl as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private onPointerDown = (e: PointerEvent): void => {
    const handle = (e.target as HTMLElement).dataset?.["handle"];
    e.preventDefault();
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.startTx = this.tx; this.startTy = this.ty;
    this.startScaleX = this.scaleX; this.startScaleY = this.scaleY;

    if (!handle) { this.gesture = "pan"; return; }
    if (handle === "rotate") { this.gesture = "rotate"; return; }
    const def = HANDLES.find((h) => h.key === handle);
    this.gesture = "scale";
    this.scaleAxis = def?.axis ?? "both";
    const c = this.frameCenter();
    this.startDist = Math.max(1, Math.hypot(e.clientX - c.x, e.clientY - c.y));
    this.startDistX = Math.max(1, Math.abs(e.clientX - c.x));
    this.startDistY = Math.max(1, Math.abs(e.clientY - c.y));
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.gesture) return;
    if (this.gesture === "pan") {
      // Screen delta → cut-frame-local delta (un-rotate by the frame orientation), applied 1:1.
      const d = this.unrotate(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y);
      const p = snapTranslate(this.startTx + d.x, this.startTy + d.y);
      this.tx = p.x; this.ty = p.y;
    } else if (this.gesture === "rotate") {
      const c = this.frameCenter();
      const a = Math.atan2(e.clientY - c.y, e.clientX - c.x) * (180 / Math.PI);
      const a0 = Math.atan2(this.dragStart.y - c.y, this.dragStart.x - c.x) * (180 / Math.PI);
      this.rotation = snapAngle(this.rotation + (a - a0));
      this.dragStart = { x: e.clientX, y: e.clientY };
    } else {
      const c = this.frameCenter();
      // Corner = aspect-locked (the diagonal distance scales BOTH axes); edge = single-axis (only
      // the handle's own axis distance scales that axis), so an edge handle never distorts the
      // perpendicular axis (D8).
      const sx = this.scaleAxis === "y"
        ? this.startScaleX
        : clampScale(this.startScaleX * (this.scaleAxis === "x"
            ? Math.max(1, Math.abs(e.clientX - c.x)) / this.startDistX
            : Math.max(1, Math.hypot(e.clientX - c.x, e.clientY - c.y)) / this.startDist));
      const sy = this.scaleAxis === "x"
        ? this.startScaleY
        : clampScale(this.startScaleY * (this.scaleAxis === "y"
            ? Math.max(1, Math.abs(e.clientY - c.y)) / this.startDistY
            : Math.max(1, Math.hypot(e.clientX - c.x, e.clientY - c.y)) / this.startDist));
      this.setScale(sx, sy);
    }
    this.dirty = true;
    this.applyPlacement();
  };

  private onPointerUp = (): void => { this.gesture = null; };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Trackpad pinch arrives as a wheel event with ctrlKey (and a small deltaY); a mouse wheel does
    // not. Damp each with its own constant (H — pinch was over-sensitive).
    const step = e.ctrlKey ? PINCH_ZOOM_PER_PX : WHEEL_ZOOM_PER_PX;
    const f = 1 - e.deltaY * step;
    const s = clampScale(this.scaleX * f);
    // Zoom is aspect-locked: both axes scale by the same factor from the current x scale.
    this.setScale(s, this.scaleX ? clampScale(this.scaleY * (s / this.scaleX)) : s);
    this.dirty = true;
    this.applyPlacement();
  };

  // Set the per-axis scale, keeping the framed content under the cut CENTRE fixed: because the img
  // is centred in the frame, scaling about its own centre keeps the centre content put iff the
  // translate scales by the same per-axis factor (derivation: t' = (s'/s)·t for a centre pivot).
  private setScale(sx: number, sy: number): void {
    sx = snapScale(sx); sy = snapScale(sy);
    if (this.scaleX) this.tx = Math.round(this.tx * (sx / this.scaleX));
    if (this.scaleY) this.ty = Math.round(this.ty * (sy / this.scaleY));
    this.scaleX = sx; this.scaleY = sy;
  }

  // Map a screen delta into the cut frame's local axes — the inverse of the frame orientation
  // (rotate AND flip) — so a pan stays intuitive when cropping an already-rotated/flipped image.
  // The frame's linear part is R(θ)·S (S = the scaleX(-1)/scaleY(-1) flips, applied AFTER rotate),
  // so the inverse is S·R(-θ): un-rotate first, then mirror per flipped axis.
  private unrotate(dx: number, dy: number): Point {
    let x = dx, y = dy;
    if (this.orientDeg) {
      const a = (-this.orientDeg * Math.PI) / 180;
      const rx = x * Math.cos(a) - y * Math.sin(a);
      const ry = x * Math.sin(a) + y * Math.cos(a);
      x = rx; y = ry;
    }
    if (getFlipH(this.existing)) x = -x;
    if (getFlipV(this.existing)) y = -y;
    return { x, y };
  }

  // ---- Preview == commit -----------------------------------------------------------------------

  // The verbatim placement transform — the SAME string toCropResult will commit — applied to the
  // live (bright) img, the dim ghost, and the handle box, so all three track together and the
  // preview equals the committed render exactly (one geometry source).
  private placementString(): string {
    return toCropResult(
      { x: this.tx, y: this.ty },
      { w: this.frameW, h: this.frameH },
      this.rotation,
      { x: this.scaleX, y: this.scaleY },
      this.frameW,
      this.intrinsicRatio
    ).transform;
  }

  private applyPlacement(): void {
    const tf = this.placementString();
    this.img.style.transform = tf;
    if (this.ghostImg) this.ghostImg.style.transform = tf;
    if (this.handleBox) this.handleBox.style.transform = tf;
  }

  // The committed crop, or null when the session is a no-op (full image, original aspect) — null
  // tells the owner to CLEAR the crop rather than write an identity placement.
  private toResult(): CropResult | null {
    const cutAspect = this.frameW / this.frameH;
    const degenerate =
      this.tx === 0 && this.ty === 0 && Math.abs(this.rotation) < 0.05 &&
      Math.abs(this.scaleX - 1) < 1e-3 && Math.abs(this.scaleY - 1) < 1e-3 &&
      Math.abs(cutAspect - this.intrinsicRatio) / this.intrinsicRatio < 0.01;
    if (degenerate) return null;
    return toCropResult(
      { x: this.tx, y: this.ty },
      { w: this.frameW, h: this.frameH },
      this.rotation,
      { x: this.scaleX, y: this.scaleY },
      this.frameW,
      this.intrinsicRatio
    );
  }
}

function clampScale(s: number): number {
  return Math.max(0.05, Math.min(20, s));
}

// The minimal slice of the Electron BrowserWindow EventEmitter surface the rotate gesture needs.
interface ElectronRotateWindow {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

// The current Electron window on macOS, reached via the SAME `@electron/remote` path the export
// save-dialog uses (export.ts) — its `rotate-gesture` event drives two-finger trackpad rotation
// (electron/electron#19294: a continuous per-emission delta in degrees, CCW-positive). Returns null
// off macOS, on mobile, or when `@electron/remote` is unavailable, so the rotate handle stays the
// only rotation path everywhere else. Reachability was verified in the running renderer (Phase 0).
function macTrackpadWindow(): ElectronRotateWindow | null {
  const req = (window as unknown as { require?: (m: string) => unknown }).require;
  if (!req) return null;
  try {
    if ((req("process") as { platform?: string } | undefined)?.platform !== "darwin") return null;
  } catch {
    return null; // no Node `process` (mobile) → not macOS desktop
  }
  for (const mod of ["@electron/remote", "electron"]) {
    try {
      const m = req(mod) as {
        getCurrentWindow?: () => ElectronRotateWindow;
        remote?: { getCurrentWindow?: () => ElectronRotateWindow };
      };
      const win = (m?.getCurrentWindow ?? m?.remote?.getCurrentWindow)?.();
      if (win && typeof win.on === "function" && typeof win.removeListener === "function") return win;
    } catch {
      /* not available — try the next module */
    }
  }
  return null;
}
