import { Vault } from "obsidian";

export interface SnippetClass {
  className: string;
  sourceFile: string;
}

const IMG_SELECTOR_PATTERNS = [
  /img\.([a-zA-Z][\w-]*)/g,
  /\.([a-zA-Z][\w-]*)\s+img/g,
  /\.([a-zA-Z][\w-]*)\s*>\s*img/g,
  // Obsidian writes the `|token` pipe text into the image's alt attribute, so
  // snippets target it via [alt~="token"] (also *=, ^=, $=, |=, =) on any
  // element (.internal-embed, .image-embed, …), not as a real CSS class.
  /\[alt\s*[~*^$|]?=\s*["']([a-zA-Z][\w-]*)["']\]/g,
  /\.image-embed\s+.*?\.([a-zA-Z][\w-]*)/g,
  /\.markdown-rendered\s+.*?\.([a-zA-Z][\w-]*)\s*(?:{|,)/g,
  /\.([a-zA-Z][\w-]*)\s*{[^}]*(?:max-width|width|height|float|display|transform|filter|border-radius|object-fit)/g,
];

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
        if (!isInternalClass(cls)) {
          results.push({ className: cls, sourceFile: fileName });
        }
      }
    } catch {
      continue;
    }
  }

  return deduplicateClasses(results);
}

function extractImageClasses(css: string): string[] {
  const classes = new Set<string>();

  for (const pattern of IMG_SELECTOR_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(css)) !== null) {
      const cls = match[1];
      if (cls && !isObsidianInternal(cls)) {
        classes.add(cls);
      }
    }
  }

  return Array.from(classes);
}

function isObsidianInternal(cls: string): boolean {
  const internals = [
    "markdown-rendered", "markdown-source-view", "markdown-reading-view",
    "image-embed", "internal-embed", "cm-editor", "workspace",
    "mod-active", "is-loaded",
  ];
  return internals.includes(cls);
}

function isInternalClass(cls: string): boolean {
  return cls.startsWith("lie-");
}

function deduplicateClasses(items: SnippetClass[]): SnippetClass[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.className)) return false;
    seen.add(item.className);
    return true;
  });
}
