import { Vault } from "obsidian";

export interface SnippetClass {
  className: string;
  sourceFile: string;
}

const IMG_CLASS_REGEX = /img\.([a-zA-Z][\w-]*)|\.([a-zA-Z][\w-]*)\s+img/g;

export async function scanSnippets(vault: Vault, excludeFile: string): Promise<SnippetClass[]> {
  const snippetsPath = `${vault.configDir}/snippets`;
  const results: SnippetClass[] = [];

  let files: string[];
  try {
    const listing = await vault.adapter.list(snippetsPath);
    files = listing.files.filter((f) => f.endsWith(".css"));
  } catch {
    return results;
  }

  for (const filePath of files) {
    const fileName = filePath.split("/").pop() ?? "";
    if (fileName === excludeFile) continue;

    try {
      const content = await vault.adapter.read(filePath);
      const classes = extractImageClasses(content);
      for (const cls of classes) {
        results.push({ className: cls, sourceFile: fileName });
      }
    } catch {
      continue;
    }
  }

  return deduplicateClasses(results);
}

function extractImageClasses(css: string): string[] {
  const classes = new Set<string>();
  let match: RegExpExecArray | null;

  IMG_CLASS_REGEX.lastIndex = 0;
  while ((match = IMG_CLASS_REGEX.exec(css)) !== null) {
    const cls = match[1] || match[2];
    if (cls) classes.add(cls);
  }

  return Array.from(classes);
}

function deduplicateClasses(items: SnippetClass[]): SnippetClass[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.className)) return false;
    seen.add(item.className);
    return true;
  });
}
