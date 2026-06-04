// Build-time flag injected by esbuild (define). True in dev builds, false in
// production — dev-only code guarded by `if (__LIE_DEV__)` is tree-shaken out
// of the production bundle.
declare const __LIE_DEV__: boolean;

// `@codemirror/commands` is an esbuild EXTERNAL — resolved at runtime to Obsidian's
// own bundled CodeMirror (like @codemirror/state and @codemirror/view), so it ships
// no installed type package. We use exactly one symbol from it; declare its shape so
// tsc resolves the import WITHOUT adding a dependency (keeps T1 — nothing bundled).
declare module "@codemirror/commands" {
  import { AnnotationType } from "@codemirror/state";
  export const isolateHistory: AnnotationType<"before" | "after" | "full">;
}
