// Pure CSS parsing & classification for the settings panel's snippet overview (F16 / AB19).
// No Obsidian / vault imports — a unit-testable logic module like `*-logic.ts` (T-convention).
// Two jobs: (1) DIFF our installed bundled snippet against the shipped default so each of OUR
// classes is unchanged / changed / deleted (for the restore affordance); (2) detect cross-file
// name collisions among the user-active classes.

export type ClassStatus = "unchanged" | "changed" | "deleted";

export interface ClassEntry {
  className: string;
  // Set ONLY for classes that belong to our bundled file. Foreign-file classes carry no status.
  status?: ClassStatus;
}

// Parse the bundled snippet's decoration rules into className → normalized body. The classes ride
// the OUTER box now (Decision 28), so the shipped form is a plain `.NAME { … }` (a single class) at
// the START of a line; the legacy `img.NAME { … }` form is still accepted so a pre-Decision-28
// installed copy migrates. A COMPOUND selector like `.circle img, img.circle { … }` is the auxiliary
// pixel rule and is deliberately NOT captured (its `.circle` is not immediately followed by `{`, and
// the `img.circle` part isn't at the line start). Comments are stripped first so a rule inside a
// /* … */ block can't masquerade as one.
export function parseImgRules(css: string): Map<string, string> {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = new Map<string, string>();
  const re = /^\s*(?:img)?\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    rules.set(m[1] ?? "", normalizeBody(m[2] ?? ""));
  }
  return rules;
}

// Normalize a rule body so a cosmetically-reformatted-but-identical rule reads as UNCHANGED, not
// "changed": split into declarations, trim the `prop:value` separator and inter-declaration spacing,
// but preserve VALUE-internal spaces (those are meaningful — `box-shadow: 0 4px 12px …`).
function normalizeBody(body: string): string {
  return body
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl.length > 0)
    .map((decl) => {
      const i = decl.indexOf(":");
      if (i < 0) return decl.replace(/\s+/g, " ");
      return `${decl.slice(0, i).trim()}:${decl.slice(i + 1).trim().replace(/\s+/g, " ")}`;
    })
    .join(";");
}

// Classify every SHIPPED bundled class against the installed file content. The shipped set is the
// canonical list (so a class deleted from the user's file still surfaces, marked `deleted`). User-
// added extra classes are NOT included here — the scanner appends those separately (status-less).
export function classifyBundledFile(installedCss: string, shippedCss: string): ClassEntry[] {
  const installed = parseImgRules(installedCss);
  const shipped = parseImgRules(shippedCss);
  const out: ClassEntry[] = [];
  for (const [className, shippedBody] of shipped) {
    if (!installed.has(className)) out.push({ className, status: "deleted" });
    else out.push({ className, status: installed.get(className) === shippedBody ? "unchanged" : "changed" });
  }
  return out;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The verbatim shipped rule text for one class (its primary `.NAME { … }` rule, for re-insertion).
function shippedRule(shippedCss: string, className: string): string | null {
  const m = new RegExp(`^\\s*(?:img)?\\.${escapeRe(className)}\\s*\\{[^}]*\\}`, "m").exec(shippedCss);
  return m ? m[0].replace(/^\s*/, "") : null;
}

// Return new file content with ONE class restored to its shipped rule (pure string transform):
//   • changed  → replace the existing `img.NAME { … }` rule in place;
//   • deleted  → append the shipped rule (on its own line).
// A class that isn't part of the shipped set is left untouched (nothing to restore TO).
export function restoreClassInCss(currentCss: string, className: string, shippedCss: string): string {
  const rule = shippedRule(shippedCss, className);
  if (!rule) return currentCss;
  const ruleRe = new RegExp(`^\\s*(?:img)?\\.${escapeRe(className)}\\s*\\{[^}]*\\}`, "m");
  // Judge presence on the comment-STRIPPED css, matching how the class's status is detected
  // (`parseImgRules` strips comments first). So a class "deleted" by COMMENTING IT OUT takes the
  // append path — NOT replace-inside-the-comment, which would leave the rule commented (still
  // detected as "deleted", so restore looked like a no-op).
  const uncommented = currentCss.replace(/\/\*[\s\S]*?\*\//g, "");
  if (ruleRe.test(uncommented)) return currentCss.replace(ruleRe, rule);
  const sep = currentCss.length === 0 || currentCss.endsWith("\n") ? "" : "\n";
  return `${currentCss}${sep}${rule}\n`;
}

// Is the installed bundled file MODIFIED relative to shipped (for the file-level install/reset/
// uninstall affordance)? True if any shipped class is missing or has a different body, or the user
// added an extra `img.*` class. Comment-insensitive (parseImgRules strips comments), matching the
// per-class status detection.
export function isBundledFileModified(installedCss: string, shippedCss: string): boolean {
  const installed = parseImgRules(installedCss);
  const shipped = parseImgRules(shippedCss);
  for (const [name, body] of shipped) {
    if (installed.get(name) !== body) return true;
  }
  for (const name of installed.keys()) {
    if (!shipped.has(name)) return true;
  }
  return false;
}

export interface ActiveFileClasses {
  fileName: string;
  classNames: string[]; // the user-ACTIVE class names in this file (already de-duped within the file)
}

// Class names that appear ACTIVE in more than one file → a real collision (two enabled snippets both
// styling `img.foo`, last-loaded wins). Same name twice in ONE file is NOT a collision (the caller
// de-dupes per file before passing it in).
export function findCollisions(files: ActiveFileClasses[]): Set<string> {
  const filesByClass = new Map<string, Set<string>>();
  for (const file of files) {
    for (const className of file.classNames) {
      const set = filesByClass.get(className) ?? new Set<string>();
      set.add(file.fileName);
      filesByClass.set(className, set);
    }
  }
  return new Set(
    Array.from(filesByClass.entries())
      .filter(([, sources]) => sources.size > 1)
      .map(([className]) => className)
  );
}
