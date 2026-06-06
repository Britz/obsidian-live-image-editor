import { Vault, normalizePath } from "obsidian";
// The shipped default snippet now lives in the Obsidian-free `bundled-snippet` module so the
// standalone runtime can inject the SAME CSS (DRY); re-exported here for existing call sites.
import { BUNDLED_SNIPPET_FILE, BUNDLED_SNIPPET_CSS } from "./bundled-snippet";
import { ClassEntry, classifyBundledFile, restoreClassInCss, isBundledFileModified } from "./snippet-classify";

export type BundledSnippetState = "missing" | "unchanged" | "modified";
export { BUNDLED_SNIPPET_FILE, BUNDLED_SNIPPET_CSS };

export interface SnippetClass {
  className: string;
  sourceFile: string;
}

// The settings overview groups classes BY FILE (unlike the flat `scanSnippets`, which the toolbar
// dropdown consumes). For our own file each class also carries its diff-against-shipped `status`.
export interface SnippetFile {
  fileName: string; // basename incl. ".css"
  isOurs: boolean;  // === BUNDLED_SNIPPET_FILE — gates the restore affordance
  classes: ClassEntry[];
}

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
 * (Decision 10 — not merely present in the folder). Internal `lie-*` and platform classes are
 * filtered out.
 */
export async function scanSnippets(vault: Vault, enabled?: Set<string>): Promise<SnippetClass[]> {
  const snippetsPath = normalizePath(`${vault.configDir}/snippets`);
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
    if (enabled && !enabled.has(base)) continue; // only enabled snippets (Decision 10)

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

/**
 * Per-file class overview for the settings panel (AB19). Like `scanSnippets` it honours Decision 10
 * (only Obsidian-ENABLED snippets), but it keeps the file grouping and, for OUR bundled file, folds
 * in the diff-against-shipped status: the SHIPPED set (so a deleted class still surfaces, marked
 * `deleted`) plus any extra image classes the user added (status-less). Classes are de-duped WITHIN
 * a file — a name repeated in the same file lists once and never collides with itself.
 */
export async function scanSnippetFiles(vault: Vault, enabled?: Set<string>): Promise<SnippetFile[]> {
  const snippetsPath = normalizePath(`${vault.configDir}/snippets`);

  let files: string[];
  try {
    files = (await vault.adapter.list(snippetsPath)).files.filter((f) => f.endsWith(".css"));
  } catch {
    return [];
  }

  const result: SnippetFile[] = [];
  for (const filePath of files) {
    const fileName = filePath.split("/").pop() ?? "";
    const base = fileName.replace(/\.css$/, "");
    if (enabled && !enabled.has(base)) continue; // only enabled snippets (Decision 10)

    let content: string;
    try {
      content = await vault.adapter.read(filePath);
    } catch {
      continue;
    }

    const imgClasses = extractImageClasses(content).filter((c) => !isInternalClass(c));
    const isOurs = fileName === BUNDLED_SNIPPET_FILE;
    let classes: ClassEntry[];
    if (isOurs) {
      const shipped = classifyBundledFile(content, BUNDLED_SNIPPET_CSS);
      const shippedNames = new Set(shipped.map((c) => c.className));
      const extra = imgClasses.filter((c) => !shippedNames.has(c)).map((c) => ({ className: c }));
      classes = [...shipped, ...extra];
    } else {
      classes = imgClasses.map((c) => ({ className: c }));
    }
    result.push({ fileName, isOurs, classes });
  }
  return result;
}

/** Restore ONE class in the installed bundled file to its shipped rule (re-insert if deleted,
 * overwrite if changed). Recreates the whole file from shipped if it's gone entirely. */
export async function restoreBundledClass(vault: Vault, className: string): Promise<void> {
  await ensureSnippetsDir(vault);
  const path = normalizePath(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`);
  let current = "";
  if (await vault.adapter.exists(path)) {
    try {
      current = await vault.adapter.read(path);
    } catch {
      current = "";
    }
  }
  const next = restoreClassInCss(current, className, BUNDLED_SNIPPET_CSS);
  if (next !== current) await vault.adapter.write(path, next);
}

/** Install the bundled example snippet WITHOUT overwriting an existing same-named file
 * (effectively a restore of a deleted file, Decision 10). Returns true if it wrote the file. */
export async function installBundledSnippet(vault: Vault): Promise<boolean> {
  const path = normalizePath(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`);
  if (await vault.adapter.exists(path)) return false;
  await ensureSnippetsDir(vault);
  await vault.adapter.write(path, BUNDLED_SNIPPET_CSS);
  return true;
}

/** Reset the bundled example snippet to the shipped version (overwrites, Decision 10). */
export async function resetBundledSnippet(vault: Vault): Promise<void> {
  await ensureSnippetsDir(vault);
  const path = normalizePath(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`);
  await vault.adapter.write(path, BUNDLED_SNIPPET_CSS);
}

export async function isBundledSnippetInstalled(vault: Vault): Promise<boolean> {
  return vault.adapter.exists(normalizePath(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`));
}

/** The file-level lifecycle state for the settings install field: missing → offer Install; modified
 * → offer Reset (+ Uninstall); unchanged → offer Uninstall. */
export async function getBundledSnippetState(vault: Vault): Promise<BundledSnippetState> {
  const path = normalizePath(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`);
  if (!(await vault.adapter.exists(path))) return "missing";
  let content = "";
  try {
    content = await vault.adapter.read(path);
  } catch {
    return "missing";
  }
  return isBundledFileModified(content, BUNDLED_SNIPPET_CSS) ? "modified" : "unchanged";
}

/** Remove the bundled example file entirely (the settings "Uninstall"). No-op if absent. */
export async function uninstallBundledSnippet(vault: Vault): Promise<void> {
  const path = normalizePath(`${vault.configDir}/snippets/${BUNDLED_SNIPPET_FILE}`);
  if (await vault.adapter.exists(path)) await vault.adapter.remove(path);
}

async function ensureSnippetsDir(vault: Vault): Promise<void> {
  const dir = normalizePath(`${vault.configDir}/snippets`);
  if (!(await vault.adapter.exists(dir))) await vault.adapter.mkdir(dir);
}

// Image file extensions that look like classes after `img.` in a COMMENT (e.g. the
// text `img.png`) — never real CSS classes.
const FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"]);

function extractImageClasses(css: string): string[] {
  // Strip /* … */ comments first so example text like `img.png` in a comment isn't
  // mistaken for a class (Bug 34).
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
