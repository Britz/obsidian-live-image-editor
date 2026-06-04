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

// On a foreign page the OUTER `.lie-image-area` IS the flow participant (no Obsidian embed
// wrapper), so alignment floats/centres the outer directly. The marker class rides the img
// (buildLayers re-derives it from `align`), so `:has(img.lie-…)` matches. margin:auto centres
// fine here (no `.cm-content > * { margin:0 !important }` to fight, unlike Obsidian — Bug 20).
const RUNTIME_CSS = `
.lie-image-area:has(img.lie-left) { float: left; clear: none; margin: 0 1em 0.5em 0; }
.lie-image-area:has(img.lie-right) { float: right; clear: none; margin: 0 0 0.5em 1em; }
.lie-image-area:has(img.lie-center) { display: block; margin-left: auto; margin-right: auto; }
`;

function inject(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
