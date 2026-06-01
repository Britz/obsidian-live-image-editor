// Build-time flag injected by esbuild (define). True in dev builds, false in
// production — dev-only code guarded by `if (__LIE_DEV__)` is tree-shaken out
// of the production bundle.
declare const __LIE_DEV__: boolean;
