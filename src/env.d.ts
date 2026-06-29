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

// `@codemirror/language` is likewise an esbuild EXTERNAL (Obsidian's bundled CodeMirror), no installed
// type package. We use exactly one symbol — `syntaxTree` — to derive embed detection from Obsidian's
// own parse (AD10). Declare the minimal node-walk shape we need (name + parent + resolveInner).
declare module "@codemirror/language" {
  import { EditorState } from "@codemirror/state";
  interface SyntaxNodeLike {
    readonly name: string;
    readonly parent: SyntaxNodeLike | null;
  }
  interface TreeCursorLike {
    readonly name: string;
    readonly from: number;
    readonly to: number;
    next(): boolean;
  }
  interface SyntaxTreeLike {
    readonly length: number;
    resolveInner(pos: number, side?: -1 | 0 | 1): SyntaxNodeLike;
    cursor(): TreeCursorLike;
  }
  export function syntaxTree(state: EditorState): SyntaxTreeLike;
  // Forces parsing up to `upto` within `timeout` ms; returns the tree (covering at least `upto`) or
  // null if it timed out — so a decoration build can see embeds BELOW the incrementally-parsed region.
  export function ensureSyntaxTree(state: EditorState, upto: number, timeout?: number): SyntaxTreeLike | null;
}
