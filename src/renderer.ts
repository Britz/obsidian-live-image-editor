import { ImageTransform, FilterData } from "./transforms";

export function applyTransformToImage(img: HTMLImageElement, t: ImageTransform): void {
  if (t.crop) {
    wrapWithCropContainer(img, t);
  } else {
    applyDirectTransform(img, t);
  }

  applyClasses(img, t.classes);
  applyFilter(img, t.filter);
}

function applyDirectTransform(img: HTMLImageElement, t: ImageTransform): void {
  const transforms: string[] = [];
  if (t.rotate) transforms.push(`rotate(${t.rotate}deg)`);
  if (t.flipH) transforms.push("scaleX(-1)");
  if (t.flipV) transforms.push("scaleY(-1)");

  img.style.transform = transforms.length ? transforms.join(" ") : "";
  if (t.width) img.style.width = `${t.width}px`;
  if (t.height) img.style.height = `${t.height}px`;
  if (t.inline) img.style.display = "inline";
}

function wrapWithCropContainer(img: HTMLImageElement, t: ImageTransform): void {
  if (img.parentElement?.classList.contains("lie-crop-container")) return;

  const crop = t.crop!;
  const container = document.createElement("div");
  container.classList.add("lie-crop-container");
  container.style.overflow = "hidden";
  container.style.display = t.inline ? "inline-block" : "block";

  const displayW = t.width ?? crop.w;
  const displayH = t.height ?? crop.h;
  container.style.width = `${displayW}px`;
  container.style.height = `${displayH}px`;

  const scaleX = displayW / crop.w;
  const scaleY = displayH / crop.h;
  const scale = Math.min(scaleX, scaleY);

  const transforms: string[] = [];
  transforms.push(`translate(${-crop.x * scale}px, ${-crop.y * scale}px)`);
  if (crop.rotate) transforms.push(`rotate(${crop.rotate}deg)`);
  transforms.push(`scale(${crop.scale * scale})`);
  if (t.flipH) transforms.push("scaleX(-1)");
  if (t.flipV) transforms.push("scaleY(-1)");

  img.style.transform = transforms.join(" ");
  img.style.transformOrigin = "top left";
  img.style.width = "";
  img.style.height = "";

  const parent = img.parentElement;
  if (!parent) return;
  parent.insertBefore(container, img);
  container.appendChild(img);
}

function applyClasses(img: HTMLImageElement, classes: string[]): void {
  for (const cls of classes) {
    const target = img.parentElement?.classList.contains("lie-crop-container")
      ? img.parentElement
      : img;
    target.classList.add(cls);
  }
}

function applyFilter(img: HTMLImageElement, filter?: FilterData): void {
  if (!filter) return;

  const parts: string[] = [];
  if (filter.brightness !== undefined && filter.brightness !== 1) {
    parts.push(`brightness(${filter.brightness})`);
  }
  if (filter.contrast !== undefined && filter.contrast !== 1) {
    parts.push(`contrast(${filter.contrast})`);
  }
  if (filter.saturate !== undefined && filter.saturate !== 1) {
    parts.push(`saturate(${filter.saturate})`);
  }
  if (filter.hueRotate !== undefined && filter.hueRotate !== 0) {
    parts.push(`hue-rotate(${filter.hueRotate}deg)`);
  }
  if (filter.blur !== undefined && filter.blur !== 0) {
    parts.push(`blur(${filter.blur}px)`);
  }
  if (filter.grayscale !== undefined && filter.grayscale !== 0) {
    parts.push(`grayscale(${filter.grayscale})`);
  }
  if (filter.sepia !== undefined && filter.sepia !== 0) {
    parts.push(`sepia(${filter.sepia})`);
  }

  img.style.filter = parts.length ? parts.join(" ") : "";
}
