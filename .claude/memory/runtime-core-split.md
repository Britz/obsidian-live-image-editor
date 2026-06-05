---
name: runtime-core-split
description: "Source/build split for the deferred portable runtime — Obsidian-free shared core, render-CSS-in-JS, two esbuild artifacts (fold into AB7a / impl-plan §3.6 after the crop-rework pass lands)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9381231a-ea41-49ea-b67f-e56d13c27b76
---

Decided 2026-06-04 (think/plan session) as the structure for the deferred portable runtime ([[lp-rendering-rework-decisions]] / [[crop-geometry-rework]] context; the FINAL crop/format model is in issues.md DEFER + requirements T2.3/T3, architecture AD2/AD3/AD6/AB6/AB7a/AB15). **Folded into the canonical docs 2026-06-04** (architecture AB7a "Split & CSS"; implementation-plan §3.6 + the `src/runtime.ts` module-map row) after the crop-geometry rework pass landed. The runtime itself stays DEFERRED.

**Shared core (Obsidian-free — zero `obsidian`/CM imports):** format parse/serialize (`*-logic.ts`, today `transforms.ts`), geometry/model (`boxAspectRatio`, transform composition, centre-origin — `renderer-logic.ts`), `buildLayers` (the outer/inner-frame/img DOM builder + per-layer routed CSS), the **render CSS as a string**, and the identification logic. Live grouped (e.g. `src/core/*`).

**Plugin-only:** reading-view post-processor adapter, CM6 live-preview extension, editing UI (toolbar/crop/filter/size/reveal), settings/commands, editing-toolbar integration, dev-bridge — all import the core.

**Standalone runtime:** imports the same core + a thin `src/runtime.ts` "scan & hydrate" entry.

**CSS split (CSS-in-JS):** `src/styles-injector.ts` already injects CSS from JS (`<style>` + `textContent`) — extend that pattern. **Render CSS** → a string IN THE CORE, injected by BOTH plugin and runtime → one source (R0: plugin and standalone render identically) and the standalone needs only the `.js`. **Chrome CSS** (toolbar/panels/crop-editor) stays in `styles.css`, plugin-only (Obsidian auto-loads it). No-JS fallback unaffected (no render CSS → original image, exactly the fidelity tiers).

**Build — two artifacts:** `main.js` (plugin) + `manifest.json` + `styles.css` (chrome) as today; **`lie-runtime.js`** (or `live-image-editor-runtime.js` — match the plugin id `live-image-editor`, NOT `live-image-runtime.js`) for the standalone, with render CSS inlined → a single `<script>` include, no separate CSS. Two esbuild entries; tree-shaking keeps the UI out of the runtime bundle.

**Nudge for the crop-rework pass (no extra cost, saves a later refactor):** put the new `buildLayers` + geometry + render-CSS-string in the Obsidian-free core + CSS-in-JS from the start, rather than building them Obsidian-entangled and extracting later. Second build artifact + `runtime.ts` entry stay DEFERRED.
