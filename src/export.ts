import { Vault } from "obsidian";
import { ImageTransform } from "./transforms";

export async function exportImage(
  img: HTMLImageElement,
  transform: ImageTransform,
  vault: Vault,
  originalPath: string
): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");

  let targetW: number;
  let targetH: number;

  if (transform.crop) {
    targetW = transform.width ?? transform.crop.w;
    targetH = transform.height ?? transform.crop.h;
  } else {
    targetW = transform.width ?? img.naturalWidth;
    targetH = transform.height ?? img.naturalHeight;
  }

  canvas.width = targetW;
  canvas.height = targetH;

  if (transform.filter) {
    const filterParts: string[] = [];
    if (transform.filter.brightness !== undefined && transform.filter.brightness !== 1) {
      filterParts.push(`brightness(${transform.filter.brightness})`);
    }
    if (transform.filter.contrast !== undefined && transform.filter.contrast !== 1) {
      filterParts.push(`contrast(${transform.filter.contrast})`);
    }
    if (transform.filter.saturate !== undefined && transform.filter.saturate !== 1) {
      filterParts.push(`saturate(${transform.filter.saturate})`);
    }
    if (transform.filter.hueRotate !== undefined && transform.filter.hueRotate !== 0) {
      filterParts.push(`hue-rotate(${transform.filter.hueRotate}deg)`);
    }
    if (transform.filter.blur !== undefined && transform.filter.blur !== 0) {
      filterParts.push(`blur(${transform.filter.blur}px)`);
    }
    if (transform.filter.grayscale !== undefined && transform.filter.grayscale !== 0) {
      filterParts.push(`grayscale(${transform.filter.grayscale})`);
    }
    if (transform.filter.sepia !== undefined && transform.filter.sepia !== 0) {
      filterParts.push(`sepia(${transform.filter.sepia})`);
    }
    if (filterParts.length) {
      ctx.filter = filterParts.join(" ");
    }
  }

  ctx.save();

  if (transform.crop) {
    const crop = transform.crop;
    const scaleX = targetW / crop.w;
    const scaleY = targetH / crop.h;
    const scale = Math.min(scaleX, scaleY);

    ctx.translate(-crop.x * scale, -crop.y * scale);
    if (crop.rotate) {
      const cx = img.naturalWidth / 2;
      const cy = img.naturalHeight / 2;
      ctx.translate(cx * scale, cy * scale);
      ctx.rotate((crop.rotate * Math.PI) / 180);
      ctx.translate(-cx * scale, -cy * scale);
    }
    ctx.scale(crop.scale * scale, crop.scale * scale);

    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);

    ctx.drawImage(img, 0, 0);
  } else {
    ctx.translate(targetW / 2, targetH / 2);
    if (transform.rotate) ctx.rotate((transform.rotate * Math.PI) / 180);
    if (transform.flipH) ctx.scale(-1, 1);
    if (transform.flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
  }

  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });

  const buffer = await blob.arrayBuffer();
  const ext = originalPath.split(".").pop() ?? "png";
  const baseName = originalPath.replace(/\.[^.]+$/, "");
  const exportPath = `${baseName}-edited.${ext}`;

  await vault.createBinary(exportPath, new Uint8Array(buffer));
  return exportPath;
}
