import { describe, it, expect } from "vitest";
import { renderInlineMarkdown } from "../../src/runtime-markdown";

// The standalone runtime's minimal inline-Markdown renderer for captions (AD9 runtime exception).
// Pure string→string, so it unit-tests in Node without a DOM.
describe("renderInlineMarkdown (runtime caption inline markdown)", () => {
  it("renders bold and italic", () => {
    expect(renderInlineMarkdown("A **bold** word")).toBe("A <strong>bold</strong> word");
    expect(renderInlineMarkdown("an *italic* word")).toBe("an <em>italic</em> word");
  });

  it("does not let the italic rule eat a bold run", () => {
    expect(renderInlineMarkdown("**b**")).toBe("<strong>b</strong>");
  });

  it("renders code spans, leaving their content untouched", () => {
    expect(renderInlineMarkdown("a `code` word")).toBe("a <code>code</code> word");
    expect(renderInlineMarkdown("`a *b* c`")).toBe("<code>a *b* c</code>");
  });

  it("renders a link and sanitises the href", () => {
    expect(renderInlineMarkdown("[site](https://example.com)")).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener">site</a>'
    );
    expect(renderInlineMarkdown("[x](javascript:alert)")).toBe(
      '<a href="#" target="_blank" rel="noopener">x</a>'
    );
  });

  it("escapes HTML before applying markdown (no injection)", () => {
    expect(renderInlineMarkdown("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(renderInlineMarkdown("<img src=x onerror=1>")).toBe("&lt;img src=x onerror=1&gt;");
  });

  it("leaves plain text unchanged", () => {
    expect(renderInlineMarkdown("A calm landscape at dusk")).toBe("A calm landscape at dusk");
  });
});
