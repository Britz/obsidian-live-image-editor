import { Editor } from "obsidian";
import { ImageTransform, parseAltText } from "./transforms";

export interface ImageLocation {
  line: number;
  start: number;    // start of the embed
  headEnd: number;  // end of the embed head (the ]] or ) ), i.e. start of any {…} block
  end: number;      // end of the embed incl. a trailing {…} block
  isWikiLink: boolean;
  filename: string; // path as written in the embed (preserved)
  params: string;   // content of the {…} transform block, "" if none
}

// Transforms are stored in a trailing {…} attribute block so the link itself —
// caption (markdown alt) and native size (wikilink pipe) — stays untouched:
//   ![caption](path){rotate:90}
//   ![[image.png|300]]{rotate:90}
const WIKI_EMBED = /!\[\[([^\]]+?)\]\](\{([^}]*)\})?/g;
const MD_EMBED = /!\[[^\]]*\]\(([^)]+)\)(\{([^}]*)\})?/g;

function basename(path: string): string {
  // For wikilinks the inner text may carry a |size/|alt suffix.
  const file = path.split("|")[0] ?? path;
  try {
    return decodeURIComponent(file).split(/[/\\]/).pop() ?? file;
  } catch {
    return file.split(/[/\\]/).pop() ?? file;
  }
}

export function findImageInSource(editor: Editor, img: HTMLImageElement): ImageLocation | null {
  const src = getImageFilename(img);
  if (!src) return null;

  for (let i = 0; i < editor.lineCount(); i++) {
    const loc = findImageInLine(editor.getLine(i), i, src);
    if (loc) return loc;
  }
  return null;
}

// Exported so the post processor can resolve params from a section's source.
export function findImageInText(text: string, src: string): ImageLocation | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const loc = findImageInLine(lines[i] ?? "", i, src);
    if (loc) return loc;
  }
  return null;
}

// Match the embed for `src` on ONE specific line — the disambiguating resolver (Bug 33): the
// caller knows the exact line (from the rendered image's DOM position), so a file embedded more
// than once resolves to the RIGHT occurrence, not merely the first basename match in the note.
export function findImageInLine(line: string, lineNo: number, src: string): ImageLocation | null {
  for (const { regex, isWiki } of [
    { regex: WIKI_EMBED, isWiki: true },
    { regex: MD_EMBED, isWiki: false },
  ]) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const path = m[1] ?? "";
      if (basename(path) !== src) continue;

      const block = m[2] ?? "";
      const end = m.index + m[0].length;
      return {
        line: lineNo,
        start: m.index,
        headEnd: end - block.length,
        end,
        isWikiLink: isWiki,
        filename: path,
        params: m[3] ?? "",
      };
    }
  }
  return null;
}

export function parseLocationTransform(location: ImageLocation): ImageTransform {
  return parseAltText(location.params);
}

export function getImageFilename(img: HTMLImageElement): string | null {
  const src = img.getAttribute("src") ?? "";
  if (!src) return null;

  try {
    const url = new URL(src);
    return decodeURIComponent(url.pathname.split("/").pop() ?? "");
  } catch {
    return decodeURIComponent(src.split("/").pop() ?? src);
  }
}
