import { Vault } from "obsidian";

export interface SnippetClass {
  className: string;
  sourceFile: string;
}

// The example DECORATION snippet the plugin ships (F16.1) — both a usable feature and
// a worked example of image CSS classes. Installed on request (opt-in), discovered
// like any other snippet once installed, and resettable to this shipped version.
export const BUNDLED_SNIPPET_FILE = "live-image-editor-examples.css";
export const BUNDLED_SNIPPET_CSS = `/* Live Image Editor — example image decoration classes.
   Installed from the plugin settings (opt-in). Edit freely; "Reset" in settings
   restores this shipped version. Apply a class in the image's trailing block. */
img.rounded { border-radius: 8px; }
img.shadow { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
img.bordered { border: 1px solid var(--background-modifier-border); }
img.circle { border-radius: 50%; object-fit: cover; aspect-ratio: 1; }
`;

const IMG_SELECTOR_PATTERNS = [
  /img\.([a-zA-Z][\w-]*)/g,
  /\.([a-zA-Z][\w-]*)\s+img/g,
  /\.([a-zA-Z][\w-]*)\s*>\s*img/g,
  /\[alt\s*[~*^$|]?=\s*["']([a-zA-Z][\w-]*)["']\]/g,
  /\.image-embed\s+.*?\.([a-zA-Z][\w-]*)/g,
  /\.markdown-rendered\s+.*?\.([a-zA-Z][\w-]*)\s*(?:{|,)/g,
  /\.([a-zA-Z][\w-]*)\s*{[^}]*(?:max-width|width|height|float|display|transform|filter|border-radius|object-fit)/g,
];

/**
 * Discover image-targeting CSS classes from the vault's snippets (F16). When
 * `enabled` is given, ONLY snippets whose file is enabled in Obsidian are scanned
 * (#6b — not merely present in the folder). Internal `lie-*` and platform classes are
 * filtered out.
 */
export async function scanSnippets(vault: Vault, enabled?: Set<string>): Promise<SnippetClass[]> {
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
    const base = fileName.replace(/\.css$/, "");
    if (enabled && !enabled.has(base)) continue; // only enabled snippets (#6b)

    try {
      const content = await vault.adapter.read(filePath);
      for (const cls of extractImageClasses(content)) {
        if (!isInternalClass(cls)) results.push({ className: cls, sourceFile: fileName });
      }
    } catch {
      continue;
    }
  }

  return deduplicateClasses(results);
}

/** Install the bundled example snippet WITHOUT overwriting an existing same-named file
 * (effectively a restore of a deleted file, #6). Returns true if it wrote the file. */
export async function installBundledSnippet(vault: Vault): Promise<boolean> {
  const path = `${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`;
  if (await vault.adapter.exists(path)) return false;
  await ensureSnippetsDir(vault);
  await vault.adapter.write(path, BUNDLED_SNIPPET_CSS);
  return true;
}

/** Reset the bundled example snippet to the shipped version (overwrites, #6). */
export async function resetBundledSnippet(vault: Vault): Promise<void> {
  await ensureSnippetsDir(vault);
  await vault.adapter.write(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`, BUNDLED_SNIPPET_CSS);
}

export async function isBundledSnippetInstalled(vault: Vault): Promise<boolean> {
  return vault.adapter.exists(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`);
}

async function ensureSnippetsDir(vault: Vault): Promise<void> {
  const dir = `${vault.configDir}/snippets`;
  if (!(await vault.adapter.exists(dir))) await vault.adapter.mkdir(dir);
}

// Image file extensions that look like classes after `img.` in a COMMENT (e.g. the
// text `img.png`) — never real CSS classes.
const FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"]);

function extractImageClasses(css: string): string[] {
  // Strip /* … */ comments first so example text like `img.png` in a comment isn't
  // mistaken for a class (Bug 13).
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const classes = new Set<string>();
  for (const pattern of IMG_SELECTOR_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const cls = match[1];
      if (cls && !isObsidianInternal(cls) && !FILE_EXTENSIONS.has(cls.toLowerCase())) classes.add(cls);
    }
  }
  return Array.from(classes);
}

function isObsidianInternal(cls: string): boolean {
  return [
    "markdown-rendered", "markdown-source-view", "markdown-reading-view",
    "image-embed", "internal-embed", "cm-editor", "workspace", "mod-active", "is-loaded",
  ].includes(cls);
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
