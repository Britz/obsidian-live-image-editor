// The standalone PORTABLE RUNTIME (AB7a / T3) — a framework-free JS bundle that hydrates a
// foreign (no-Obsidian) page: it CLAIMS images carrying the bare-key transform attributes and
// builds the SAME uniform 3-layer structure the plugin builds, via the SAME core (`buildLayers`
// + `RENDER_CSS`) — two callers, one builder (DRY/R0). Built as a SECOND esbuild entry →
// `lie-runtime.js`, with the render CSS inlined (CSS-in-JS), so a single `<script>` include is
// all a static site needs. It imports ONLY the Obsidian-free core — no obsidian / CodeMirror —
// so the bundle never pulls the plugin framework (enforced: the runtime esbuild entry has no
// `obsidian` external, so a stray import would fail the build).
//
// Fidelity tiers (T3/F25): with this runtime injectable (e.g. MkDocs) the rotate/flip/transform
// transforms render at full fidelity; without it the no-JS fallback keeps the native-faithful
// `align`/`width` (real HTML attrs) and shows the ORIGINAL image for the runtime-only keys.
// Limitation: kramdown/Jekyll never attach the bare-brace `{…}` to the DOM, so there it is
// unsupported (the plain original shows) — documented, out of scope.

import { buildLayers, readTransform, RENDER_CSS, CLAIM_SELECTOR } from "./render-core";
import { BUNDLED_SNIPPET_CSS } from "./bundled-snippet";

// On a foreign page the OUTER `.lie-image-area` IS the flow participant (no Obsidian embed
// wrapper), so alignment floats/centres the outer directly. The marker class rides the OUTER
// (buildLayers re-derives it from `align`, Decision 28), so a DIRECT `.lie-image-area.lie-…`
// selector matches — no `:has` needed here (we build + class the element we style). margin:auto
// centres fine (no `.cm-content > * { margin:0 !important }` to fight, unlike Obsidian — Bug 27).
const RUNTIME_CSS = `
.lie-image-area.lie-float-left { float: left; clear: none; margin: 0 1em 0.5em 0; }
.lie-image-area.lie-float-right { float: right; clear: none; margin: 0 0 0.5em 1em; }
.lie-image-area.lie-block-left { display: block; margin-right: auto; }
.lie-image-area.lie-block-center { display: block; margin-left: auto; margin-right: auto; }
.lie-image-area.lie-block-right { display: block; margin-left: auto; }
`;

// A foreign page has no Obsidian-loaded stylesheet, so the runtime must supply the render +
// alignment + decoration CSS itself. It does so with a CONSTRUCTABLE stylesheet
// (`document.adoptedStyleSheets`) rather than a `<style>` element: same effect, no
// `createElement("style")`. The Obsidian review bot scans THIS bundle too — even though it never
// runs inside Obsidian — and fails `no-forbidden-elements` on a `<style>`; adoptedStyleSheets is
// the rule-clean equivalent that also keeps the runtime self-contained (Decision 29 / Lesson 18).
const injected = new Set<string>();
function inject(id: string, css: string): void {
  if (injected.has(id)) return;
  injected.add(id);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

// Every claimed `<img>` at or under `root` that isn't already hydrated.
function claimedImages(root: Node): HTMLImageElement[] {
  const out: HTMLImageElement[] = [];
  if (root instanceof HTMLImageElement && root.matches(CLAIM_SELECTOR)) out.push(root);
  if (root instanceof Element || root instanceof Document) {
    for (const el of Array.from(root.querySelectorAll(CLAIM_SELECTOR))) {
      if (el instanceof HTMLImageElement) out.push(el);
    }
  }
  return out;
}

function hydrate(root: Node): void {
  for (const img of claimedImages(root)) {
    if (img.closest(".lie-frame")) continue; // already wrapped
    buildLayers(img, readTransform(img));
  }
}

function run(): void {
  inject("lie-runtime-render-css", RENDER_CSS);
  inject("lie-runtime-css", RUNTIME_CSS);
  // Ship the plugin's DEFAULT decoration-class stack (F16.1: rounded/shadow/bordered/circle) so a
  // foreign page renders class-styled images the same as Obsidian. The plugin installs this as an
  // opt-in vault snippet; the runtime always injects this shipped default (shipping the user's
  // MODIFIED in-vault snippets is a future extension — issues.md). `var(--background-modifier-border)`
  // in `.bordered` is an Obsidian theme var absent off-Obsidian, so that one border may not paint.
  inject("lie-runtime-snippet-css", BUNDLED_SNIPPET_CSS);
  hydrate(document);
  // Hydrate content added after load (SPA / lazy theme rendering).
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) for (const n of Array.from(m.addedNodes)) hydrate(n);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
