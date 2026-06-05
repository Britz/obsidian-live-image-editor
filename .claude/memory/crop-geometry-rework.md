---
name: crop-geometry-rework
description: "Crop geometry & representation rework — 3-layer DOM + Bug 42 fix + crop serialization (Slices 1-4 done, uncommitted; crop-in-place Slice 5 deferred)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 40a7ab5a-0a68-4a17-a431-54d1c6a1da5c
---

2026-06-04: Implemented the crop-geometry & representation rework (the [[lp-rendering-rework-decisions]] sibling). **Slices 1–4 done, build+lint+test green (108 tests), CDP-verified, NOT committed** (user commits).

- **Model** (`transforms.ts`): orientation is now FIELDS — `rotate?:number`, `flipH?/flipV?:boolean` (routed to the inner-frame), separate from `transform` (= crop PLACEMENT only, on the img). `getRotation/setRotation/getFlipH/V/toggleFlip` back these fields. Serializer emits bare keys `rotate=`/`flip=horizontal|vertical`/`transform="…"`/`filter="…"`/`aspect-ratio=`; parser reads those AND legacy `style="transform:…"` (back-compat: orientation-only legacy decomposes to fields, a crop placement stays whole).
- **3-layer DOM** (`renderer.ts`): `.lie-image-area` (OUTER, footprint) → `.lie-frame` (INNER-FRAME, rotate+flip about centre + overflow:hidden) → `<img>` (crop placement + filter). `ensureLayers` upgrades reused legacy 2-layer DOM. `shapeFrame`/`cropAspect` drive the footprint from the base shape (natural ratio, or cut shape for a crop) + angle via `--lie-auto-aspect` (swaps on rotate).
- **Bug 42 FIXED**: rotating a crop puts the rotate on the frame (centre pivot) → the img crop placement is byte-identical, no drift. CDP: crop vs crop+rotate90 had identical img transform, footprint swapped 240×180→180×240.
- **Export** (`export.ts`): `renderContent` (cut/full image + filter at original res) → `orient` (rotate+flip → rotated bbox). Composes crop+orientation (CDP: crop 667×500 → cropRot90 500×667).
- **Crop serialization** (`crop-editor-logic.ts` `toCropResult`): emits `{transform, width, aspectRatio?}` — cut shape stored only when ≠ original (AD6), never a fixed px height. `main.ts` crop apply sets `tr.aspectRatio`, clears `tr.height`.

**Why:** Bug 42 + crop-in-place + crop serialization were ONE problem (crop geometry/representation); the orientation↔placement split + 3-layer solve all three.

**How to apply / STILL OPEN:** Slice 5 **crop-in-place** (drop the mirroring overlay, edit the live structure) is DEFERRED — the overlay is `position:fixed` on body to escape ancestor clipping (`overflow:hidden`, `contain:paint`), and interactive pan/zoom/rotate isn't autonomously CDP-verifiable (needs manual drag testing). The crop editor still uses the overlay (works, serializes new format). DEFERRED format migration: `width`/`height` still in `style=`, `align` still a `.lie-left/right/center` class, runtime bundle (AB7a) unbuilt. Docs (issues.md/architecture/impl/test-plan) updated to "implemented".
