import { App, Modal, Setting, Vault } from "obsidian";
import { ImageTransform, getRotation, getFlipH, getFlipV, isCrop, getWidthPx, getHeightPx } from "./transforms";
import { rotatedAabb } from "./renderer-logic";

interface Fn { name: string; args: string[]; }

// Parse a native CSS transform string into ordered functions with numeric+unit args.
function parseTransformFns(s?: string): Fn[] {
  const out: Fn[] = [];
  if (!s) return out;
  const re = /([a-zA-Z][\w-]*)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push({ name: m[1] ?? "", args: (m[2] ?? "").split(",").map((a) => a.trim()) });
  }
  return out;
}

const numOf = (a: string | undefined): number => parseFloat(a ?? "") || 0;

/**
 * Render the image WITH all its transforms applied (rotate, flip, free-rotation crop,
 * filters) to a PNG buffer — the SAME visual result as displayed (F13), but sized from
 * the ORIGINAL image's native resolution (the display `width` never reduces export
 * quality). It replays the SAME 3-layer composition the renderer applies (AB15, no parallel
 * crop/rotate math): FIRST the content (the cut region for a crop, else the full image) with
 * the `filter` baked in at original resolution, THEN the inner-frame ORIENTATION (rotate +
 * flip) about the centre — exactly outer ← frame ← img replayed on the canvas. So a rotated
 * crop exports with the orientation around the preserved cut (Bug 25), not a parallel branch.
 */
export async function renderTransformedImage(
  img: HTMLImageElement,
  transform: ImageTransform
): Promise<ArrayBuffer> {
  const content = renderContent(img, transform);
  const oriented = orient(content, getRotation(transform), getFlipH(transform), getFlipV(transform));
  const blob = await new Promise<Blob>((resolve, reject) => {
    oriented.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png");
  });
  return blob.arrayBuffer();
}

// The CONTENT layer (the <img>): the cut region for a crop, else the full image — at the
// ORIGINAL resolution, with the `filter` baked in. The inner-frame ORIENTATION is NOT applied
// here (orient() does it), matching the layer split: crop placement + filter ride the img.
function renderContent(img: HTMLImageElement, transform: ImageTransform): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const r = nh ? nw / nh : 1;

  if (isCrop(transform)) {
    // Crop: the cut frame is fw × fh display px (width + the cut-frame aspect); the original is
    // shown at width:100% of the frame (= fw), height auto, with the placement transform
    // `translate(%) [rotate] scale` (top-left origin, content-rotate included). Replay it at a
    // factor E that brings the natural image to 1:1 → the cut region at original resolution (F13).
    const fw = getWidthPx(transform) ?? nw;
    const cutAspect = cropAspect(transform, r);
    const fh = Math.max(1, Math.round(fw / cutAspect));
    const fns = parseTransformFns(transform.transform);
    const scaleFn = fns.find((f) => f.name === "scale");
    const s = scaleFn ? numOf(scaleFn.args[0]) || 1 : 1;
    const wCss = fw;                 // img width:100% of frame
    const hCss = nh ? fw / r : fh;   // img height:auto, natural aspect
    const E = fw && s ? nw / (fw * s) : 1;

    canvas.width = Math.max(1, Math.round(fw * E));
    canvas.height = Math.max(1, Math.round(fh * E));
    if (transform.filter) ctx.filter = transform.filter;
    ctx.scale(E, E);
    for (const fn of fns) {
      if (fn.name === "translate") {
        ctx.translate(pctOrPx(fn.args[0], wCss), pctOrPx(fn.args[1], hCss));
      } else if (fn.name === "rotate") {
        ctx.rotate((numOf(fn.args[0]) * Math.PI) / 180);
      } else if (fn.name === "scale") {
        ctx.scale(numOf(fn.args[0]) || 1, numOf(fn.args[1] ?? fn.args[0]) || 1);
      } else if (fn.name === "scaleX") {
        ctx.scale(numOf(fn.args[0]), 1);
      } else if (fn.name === "scaleY") {
        ctx.scale(1, numOf(fn.args[0]));
      }
    }
    ctx.drawImage(img, 0, 0, wCss, hCss);
    return canvas;
  }

  // Non-crop: the full image at original resolution, optionally distorted (both width+height);
  // the filter is baked in. Orientation is applied by orient().
  const wPx = getWidthPx(transform);
  const hPx = getHeightPx(transform);
  const distort = wPx && hPx ? hPx / wPx : null;
  const outW = nw;
  const outH = distort ? Math.max(1, Math.round(nw * distort)) : nh;
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  if (transform.filter) ctx.filter = transform.filter;
  ctx.drawImage(img, 0, 0, outW, outH);
  return canvas;
}

// Apply the inner-frame ORIENTATION (rotate + flip, about the centre) to a content canvas →
// the rotated bounding box (the footprint). Identity (deg 0, no flip) returns the content as-is.
function orient(content: HTMLCanvasElement, deg: number, flipH: boolean, flipV: boolean): HTMLCanvasElement {
  if (deg % 360 === 0 && !flipH && !flipV) return content;
  const box = rotatedAabb(content.width, content.height, deg);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(box.w));
  out.height = Math.max(1, Math.round(box.h));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  if (flipH) ctx.scale(-1, 1);
  if (flipV) ctx.scale(1, -1);
  ctx.drawImage(content, -content.width / 2, -content.height / 2);
  return out;
}

// The cut-frame aspect (w/h) for a crop: a stored `aspect-ratio` (T2.3), else explicit
// width+height px (legacy), else the natural ratio. Mirrors renderer.ts cropAspect.
function cropAspect(t: ImageTransform, naturalRatio: number): number {
  const m = (t.aspectRatio ?? "").match(/^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/);
  if (m) {
    const a = parseFloat(m[1] ?? ""); const b = m[2] ? parseFloat(m[2]) : 1;
    if (a > 0 && b > 0) return a / b;
  }
  const w = getWidthPx(t), h = getHeightPx(t);
  return w && h ? w / h : (naturalRatio > 0 ? naturalRatio : 1);
}

// A translate arg expressed as a percent of `basis` (the img display dimension) or a
// raw px length.
function pctOrPx(arg: string | undefined, basis: number): number {
  const a = (arg ?? "").trim();
  if (a.endsWith("%")) return (parseFloat(a) / 100) * basis;
  return parseFloat(a) || 0;
}

const dirOf = (p: string): string => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i + 1); };
const baseOf = (p: string): string => (p.split("/").pop() ?? p).replace(/\.[^.]+$/, "");
const extOf = (p: string): string => p.split(".").pop() ?? "png";

/**
 * The pre-filled suggestion: same folder as the original, name = `{original}-{n}`
 * with the next free number `n`.
 */
export async function suggestExportPath(vault: Vault, originalPath: string): Promise<string> {
  const dir = dirOf(originalPath);
  const base = baseOf(originalPath);
  const ext = extOf(originalPath);
  // Bounded probe so a pathological folder can't spin forever; after the cap fall
  // back to a clearly-unique suffix rather than hanging on sequential I/O.
  for (let n = 1; n < 10000; n++) {
    const candidate = `${dir}${base}-${n}.${ext}`;
    if (!(await vault.adapter.exists(candidate))) return candidate;
  }
  return `${dir}${base}-${Date.now()}.${ext}`;
}

// Electron's save dialog, if reachable (desktop only) — for the OS-native file-save
// menu. Returns null on mobile / when unavailable.
function electronDialog(): { showSaveDialog: (o: unknown) => Promise<{ canceled: boolean; filePath?: string }> } | null {
  const req = (window as unknown as { require?: (m: string) => unknown }).require;
  if (!req) return null;
  for (const mod of ["@electron/remote", "electron"]) {
    try {
      const m = req(mod) as { dialog?: unknown; remote?: { dialog?: unknown } };
      const dialog = (m?.dialog ?? m?.remote?.dialog) as { showSaveDialog: (o: unknown) => Promise<{ canceled: boolean; filePath?: string }> } | undefined;
      if (dialog?.showSaveDialog) return dialog;
    } catch {
      /* not available */
    }
  }
  return null;
}

/**
 * Save the rendered buffer (F8 + new requirement): open the OS-native save dialog
 * (desktop) defaulting to the original file's folder with `{name}-{n}` pre-filled,
 * letting the user keep it, overwrite the original (or any file), or change the
 * name/location entirely. Falls back to an Obsidian modal with an editable vault
 * path (mobile / no Electron dialog). Returns the saved path, or null if cancelled.
 */
export async function saveExport(
  app: App,
  vault: Vault,
  buffer: ArrayBuffer,
  suggestedRel: string,
  originalPath: string
): Promise<string | null> {
  const adapter = vault.adapter as unknown as { basePath?: string; writeBinary: (p: string, d: ArrayBuffer) => Promise<void> };
  const dialog = electronDialog();
  const req = (window as unknown as { require?: (m: string) => unknown }).require;

  // OS-native dialog (desktop): opens at the original folder with the suggestion.
  if (dialog && adapter.basePath && req) {
    const path = req("path") as { join: (...a: string[]) => string; relative: (a: string, b: string) => string; sep: string };
    const fs = req("fs") as { writeFileSync: (p: string, d: Uint8Array) => void };
    const ext = extOf(suggestedRel);
    const res = await dialog.showSaveDialog({
      title: "Export edited image",
      defaultPath: path.join(adapter.basePath, suggestedRel),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, new Uint8Array(buffer));
    // Report a vault-relative path when the file landed inside the vault.
    const rel = path.relative(adapter.basePath, res.filePath);
    return rel && !rel.startsWith("..") ? rel.split(path.sep).join("/") : res.filePath;
  }

  // Fallback: an Obsidian modal with an editable vault path (overwrite/relocate).
  return new Promise<string | null>((resolve) => {
    new ExportPathModal(app, suggestedRel, originalPath, async (rel) => {
      if (!rel) return resolve(null);
      await adapter.writeBinary(rel, buffer); // writeBinary overwrites if it exists
      resolve(rel);
    }).open();
  });
}

// Obsidian-native fallback "save menu": an editable vault path, pre-filled with the
// suggestion. Editing it to the original name overwrites; any folder/name works.
class ExportPathModal extends Modal {
  constructor(
    app: App,
    private value: string,
    private originalPath: string,
    private onSubmit: (path: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Export edited image" });
    contentEl.createEl("p", {
      text: "Vault path for the exported image. Keep the suggestion, set it to the original to overwrite, or change the folder/name.",
      cls: "setting-item-description",
    });

    let input: HTMLInputElement;
    new Setting(contentEl).setName("Save as").addText((t) => {
      input = t.inputEl;
      t.setValue(this.value).onChange((v) => (this.value = v));
      t.inputEl.style.width = "100%";
      window.setTimeout(() => { input.focus(); input.select(); }, 0);
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Overwrite original").onClick(() => this.submit(this.originalPath))
      )
      .addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit(this.value)));
  }

  private submit(path: string): void {
    const trimmed = path.trim();
    this.close();
    this.onSubmit(trimmed || null);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
