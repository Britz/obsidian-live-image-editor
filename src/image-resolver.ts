import { Editor } from "obsidian";
import { ImageTransform, serializeTransform } from "./transforms";

interface ImageLocation {
  line: number;
  start: number;
  end: number;
  isWikiLink: boolean;
  filename: string;
  altText: string;
}

export function findImageInSource(editor: Editor, img: HTMLImageElement): ImageLocation | null {
  const src = getImageFilename(img);
  if (!src) return null;

  const lineCount = editor.lineCount();
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const mdRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`);
  const wikiRegex = new RegExp(`!\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`);

  for (let i = 0; i < lineCount; i++) {
    const line = editor.getLine(i);

    const mdMatch = mdRegex.exec(line);
    if (mdMatch) {
      return {
        line: i,
        start: mdMatch.index,
        end: mdMatch.index + mdMatch[0].length,
        isWikiLink: false,
        filename: src,
        altText: mdMatch[1] ?? "",
      };
    }

    const wikiMatch = wikiRegex.exec(line);
    if (wikiMatch) {
      const altPart = wikiMatch[1] ? wikiMatch[1].slice(1) : "";
      return {
        line: i,
        start: wikiMatch.index,
        end: wikiMatch.index + wikiMatch[0].length,
        isWikiLink: true,
        filename: src,
        altText: altPart,
      };
    }
  }

  return null;
}

export function updateImageSource(
  editor: Editor,
  location: ImageLocation,
  transform: ImageTransform,
  convertWikiLinks: boolean
): void {
  const newAlt = serializeTransform(transform);
  let replacement: string;

  if (location.isWikiLink && convertWikiLinks && newAlt) {
    replacement = `![${newAlt}](${location.filename})`;
  } else if (location.isWikiLink) {
    if (newAlt) {
      replacement = `![[${location.filename}|${newAlt}]]`;
    } else {
      replacement = `![[${location.filename}]]`;
    }
  } else {
    replacement = `![${newAlt}](${location.filename})`;
  }

  editor.replaceRange(
    replacement,
    { line: location.line, ch: location.start },
    { line: location.line, ch: location.end }
  );
}

function getImageFilename(img: HTMLImageElement): string | null {
  const src = img.getAttribute("src") ?? "";
  if (!src) return null;

  try {
    const url = new URL(src);
    return decodeURIComponent(url.pathname.split("/").pop() ?? "");
  } catch {
    return decodeURIComponent(src.split("/").pop() ?? src);
  }
}
