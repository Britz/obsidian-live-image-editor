import { App, Modal, Setting, Vault } from "obsidian";
import { ImageTransform, FilterData } from "./transforms";

// Canvas filter string in the SAME order as the injected `img.lie-img` CSS rule, so
// the exported pixels match the displayed filters exactly. Only non-default parts.
function canvasFilter(f?: FilterData): string {
  if (!f) return "";
  const p: string[] = [];
  if (f.brightness !== undefined && f.brightness !== 1) p.push(`brightness(${f.brightness})`);
  if (f.contrast !== undefined && f.contrast !== 1) p.push(`contrast(${f.contrast})`);
  if (f.saturate !== undefined && f.saturate !== 1) p.push(`saturate(${f.saturate})`);
  if (f.hueRotate !== undefined && f.hueRotate !== 0) p.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.blur !== undefined && f.blur !== 0) p.push(`blur(${f.blur}px)`);
  if (f.grayscale !== undefined && f.grayscale !== 0) p.push(`grayscale(${f.grayscale})`);
  if (f.sepia !== undefined && f.sepia !== 0) p.push(`sepia(${f.sepia})`);
  return p.join(" ");
}

/**
 * Render the image WITH all its transforms applied — rotation, flip, free-rotation
 * crop, resize and filters — to a PNG buffer, exactly as it is displayed (F8). The
 * canvas geometry mirrors the renderer (renderer.ts) so the export matches the
 * on-screen result: crops rotate around the TOP-LEFT origin like
 * `wrapWithCropContainer`; rotations use the rotated bounding box like
 * `reserveBox`.
 */
export async function renderTransformedImage(
  img: HTMLImageElement,
  transform: ImageTransform
): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const filter = canvasFilter(transform.filter);

  if (transform.crop) {
    const crop = transform.crop;
    const displayW = transform.width ?? crop.w;
    const displayH = transform.height ?? crop.h;
    const scale = Math.min(displayW / crop.w, displayH / crop.h);
    canvas.width = Math.max(1, Math.round(displayW));
    canvas.height = Math.max(1, Math.round(displayH));
    if (filter) ctx.filter = filter;
    ctx.translate(-crop.x * scale, -crop.y * scale);
    if (crop.rotate) ctx.rotate((crop.rotate * Math.PI) / 180);
    ctx.scale(crop.scale * scale, crop.scale * scale);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0, nw, nh);
  } else if (transform.rotate && transform.rotate % 360 !== 0) {
    const rad = (transform.rotate * Math.PI) / 180;
    const bw0 = Math.abs(nw * Math.cos(rad)) + Math.abs(nh * Math.sin(rad));
    const bh0 = Math.abs(nw * Math.sin(rad)) + Math.abs(nh * Math.cos(rad));
    const s = transform.width ? transform.width / bw0 : 1;
    canvas.width = Math.max(1, Math.round(bw0 * s));
    canvas.height = Math.max(1, Math.round(bh0 * s));
    if (filter) ctx.filter = filter;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(s, s);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
  } else {
    // Match the renderer (img width/height with the other axis `auto`): width-only
    // and height-only both preserve aspect ratio; only when BOTH are set does the
    // image stretch to exactly w×h. Deriving the scale from width alone would squash
    // a height-only resize (canvas = natural width × requested height).
    const sx = transform.width ? transform.width / nw : null;
    const sy = transform.height ? transform.height / nh : null;
    const outW = Math.max(1, Math.round(nw * (sx ?? sy ?? 1)));
    const outH = Math.max(1, Math.round(nh * (sy ?? sx ?? 1)));
    canvas.width = outW;
    canvas.height = outH;
    if (filter) ctx.filter = filter;
    ctx.translate(outW / 2, outH / 2);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -outW / 2, -outH / 2, outW, outH);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png");
  });
  return blob.arrayBuffer();
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
