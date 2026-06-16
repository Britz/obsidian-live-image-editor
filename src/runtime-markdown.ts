// Minimal INLINE-Markdown renderer for the standalone runtime's captions. AD9: off-Obsidian there
// is NO platform `MarkdownRenderer` to reuse, so this is not a parallel reimplementation of a
// capability the platform provides — it provides none here. It is runtime-ONLY (imported solely by
// runtime.ts, never by the plugin's caption path, which keeps using Obsidian's renderer).
//
// It handles the inline basics — bold, italic, code, link — on the image's alt text. The alt is
// HTML-ESCAPED first (it is page/author content), then a fixed set of inline patterns is applied
// and link hrefs are sanitised, so the result is safe to assign as `innerHTML`.
//
// Fidelity ceiling: the alt attribute is LOSSY — e.g. python-markdown strips code-span backticks
// before the runtime ever sees the alt — so a span the page generator dropped cannot be recovered.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Allow only benign URL schemes / relative forms; everything else (e.g. `javascript:`) -> "#".
function safeHref(url: string): string {
  const u = url.trim();
  return /^(https?:|mailto:|#|\/|\.\.?\/)/i.test(u) ? u : "#";
}

export function renderInlineMarkdown(text: string): string {
  // SPLIT on code spans (capturing group -> odd indices are the `...` spans) and process emphasis /
  // links ONLY on the non-code segments, so a `*` or `[` inside a code span stays literal. Escape
  // first, then split (backticks are not escaped, so the split pattern still matches).
  return escapeHtml(text).split(/(`[^`]+`)/).map((part, i) => {
    if (i % 2 === 1) return `<code>${part.slice(1, -1)}</code>`;
    // Links [text](url) — the label is already escaped; the href is sanitised.
    let s = part.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m: string, label: string, url: string) => `<a href="${safeHref(url)}" target="_blank" rel="noopener">${label}</a>`);
    // Bold before italic so `**x**` is not consumed by the single-asterisk rule. Only `*...*` (not
    // `_..._`) to avoid mangling snake_case / URLs in plain captions.
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return s;
  }).join("");
}
