#!/usr/bin/env node
// RESIZE AFFORDANCE — the first BLACK-BOX / OPTICAL slice of the test-coverage initiative
// (test-plan §4 "Resize affordance", D4 + D15). It OBSERVES the visible painted result — pixels and
// pointer hit-tests — NOT CSS properties, so it survives CSS refactors and Obsidian updates (the
// exact failure that motivated this layer: an Obsidian 1.12.7 specificity bump silently broke the
// crop overflow — the old containment-lift hack — and no property-reading test caught it; the body
// portal (Variante B) replaced that hack).
//
// What it checks (each by observation, never by reading `contain`/`display`/`box-shadow`):
//   1. selected/hover  → the native resize handle is GRABBABLE at the image's bottom-right corner
//                        (elementFromPoint there is the resize corner).                        [D4]
//   2. hover           → a selection FRAME is painted around the image (accent pixels along the
//                        inner edge that appear ONLY on hover — a hover/no-hover pixel diff).   [D15]
//   3. crop            → the same corner point is NO LONGER the resize handle: it is absent and
//                        inert while cropping.                                                  [D4]
//   4. crop            → an accent FRAME still outlines the cut / resulting image.              [D15]
//   5. crop            → the dim surround is PAINTED & HIT-TESTABLE OUTSIDE the result window (the
//                        ghost overflows it via the BODY PORTAL, escaping the host's contain:paint).
//                        elementFromPoint just outside the result returns the portal ghost image —
//                        this is the VEIL-PORTAL canary: if the portal fails to escape containment or
//                        carry the pan hit-surface, this point hits the editor instead → FAIL.  [D8/D15]
//
// Prereqs (CLAUDE.md → "Live debugging"): a DEV build installed in example-vault/ and Obsidian
// launched with the CDP relay, the fixture note open-able in Live Preview. Run from the repo root:
//   node tests/cdp/verify-resize-affordance.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults host.containers.internal,
// 9223 direct to Obsidian, target "example-vault").
//
// NOTE (untested-by-author): the pixel thresholds below are first-cut and may want tuning on the
// first live run; the four hit-test checks (1, 3, 5) are the robust backbone and the real
// regression guards — the contain canary (5) is the headline.

import { connectOptical, pixel, parseColor, near } from "./_optical.mjs";

const FIXTURE = "_affordance-fixture.md";

// Fraction of rows along a vertical edge where an accent pixel is found a couple px inside the clip
// edge. With `refImg` given, only count a pixel that is accent in `img` but NOT in `refImg` (the
// hover/no-hover diff — isolates the frame from the static image content).
function edgeAccentFraction(img, clip, accent, { dxs, y0 = 0.1, y1 = 0.9, refImg = null }) {
  const sx = img.width / clip.width;
  const sy = img.height / clip.height;
  const step = Math.max(1, Math.round(sy));
  let total = 0, hit = 0;
  for (let y = Math.floor(img.height * y0); y < Math.floor(img.height * y1); y += step) {
    total++;
    for (const dx of dxs) {
      const px = pixel(img, Math.round(dx * sx), y);
      if (!near(px, accent, 75)) continue;
      if (refImg && near(pixel(refImg, Math.round(dx * sx), y), accent, 75)) continue; // same on no-hover → not the frame
      hit++;
      break;
    }
  }
  return total ? hit / total : 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cdp = await connectOptical();
  let setupDone = false;
  try {
    // ---- setup: create + open the fixture in LP, locate the image, capture geometry ----
    const setup = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      if (!plugin) return { fatal: "plugin not loaded" };
      const vault = app.vault;
      const content = "# Resize affordance fixture\\n\\nbody text body text body text body text\\n\\n![](images/sample-landscape.png){width=320}\\n\\nmore body text below the image\\n";
      let f = vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
      if (f) await vault.modify(f, content); else f = await vault.create(${JSON.stringify(FIXTURE)}, content);
      await app.workspace.getLeaf(false).openFile(f);
      await new Promise(r => setTimeout(r, 1200));
      const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
      if (!ed || !ed.cm) return { fatal: "no editor/cm (open the fixture in Live Preview)" };
      ed.setCursor({ line: 0, ch: 0 });
      await new Promise(r => setTimeout(r, 200));
      const img = document.querySelector(".lie-image-area img");
      if (!img) return { fatal: "no rendered .lie-image-area img" };
      plugin.activeImage = img;
      const area = img.closest(".lie-image-area");
      if (!area) return { fatal: "image not inside a .lie-image-area" };
      const r = area.getBoundingClientRect();
      // Resolve the accent to a concrete rgb() via a probe element (the var is hsl()/hex/etc. — a
      // computed color is always rgb(), so the pixel matcher needs no colour-space parsing).
      const probe = document.createElement("div");
      probe.style.color = "var(--color-accent)";
      document.body.appendChild(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return { ok: true, accent, area: { x: r.left, y: r.top, w: r.width, h: r.height } };
    })()`);
    setupDone = true;
    if (!setup || setup.fatal || !setup.ok) throw new Error("setup: " + JSON.stringify(setup));

    const accent = parseColor(setup.accent);
    if (!accent) throw new Error("could not parse accent colour: " + JSON.stringify(setup.accent));
    const A = setup.area;
    const cornerPt = { x: A.x + A.w - 3, y: A.y + A.h - 3 }; // image bottom-right corner (viewport CSS px)
    const center = { x: A.x + A.w / 2, y: A.y + A.h / 2 };

    // ---- 2 (part a): frame OFF — pointer parked away from the image ----
    await cdp.hover(5, 5);
    await sleep(150);
    const frameOff = await cdp.screenshot({ x: A.x, y: A.y, width: A.w, height: A.h });

    // ---- hover ON: frame + handle ----
    await cdp.hover(center.x, center.y);
    await sleep(150);
    const frameOn = await cdp.screenshot({ x: A.x, y: A.y, width: A.w, height: A.h });
    const handleHittable = await cdp.evaluate(
      `!!document.elementFromPoint(${cornerPt.x}, ${cornerPt.y})?.closest(".image-resize-corner")`,
    );
    // The handle MARKER is centred on the corner tip — half of it sits OUTSIDE the image. A 24px box
    // straddling the corner should carry MORE accent in the 3 outside-corner quadrants than in the
    // single image-side quadrant; if the host's containment clips it, the outside half is missing.
    const cornerShot = await cdp.screenshot({ x: A.x + A.w - 12, y: A.y + A.h - 12, width: 24, height: 24 });
    let mInner = 0, mOuter = 0;
    {
      const sx = cornerShot.width / 24, sy = cornerShot.height / 24;
      for (let yy = 0; yy < 24; yy++) for (let xx = 0; xx < 24; xx++) {
        if (near(pixel(cornerShot, xx * sx, yy * sy), accent, 80)) (xx >= 12 || yy >= 12) ? mOuter++ : mInner++;
      }
    }
    const markerFullyVisible = mOuter > 0 && mOuter >= mInner;

    // selection frame appears on hover: accent along the LEFT inner edge (clear of the top-left
    // toolbar and the bottom-right handle), present on-hover but not off-hover.
    const fracFrameHover = edgeAccentFraction(frameOn, { x: A.x, y: A.y, width: A.w, height: A.h }, accent, {
      dxs: [1, 2, 3], y0: 0.42, y1: 0.95, refImg: frameOff,
    });

    // ---- crop ----
    const crop = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      const img = document.querySelector(".lie-image-area img");
      if (!img) return { fatal: "image vanished before crop" };
      plugin.activeImage = img;
      plugin.crop();
      await new Promise(r => setTimeout(r, 350));
      const area = img.closest(".lie-image-area");
      // zoom in so the image clearly overflows the cut window (fresh crop fills the cut 1:1)
      for (let i = 0; i < 3; i++) area.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 150));
      // The handle chrome now lives in the BODY PORTAL (Variante B); query it there, not in the area.
      const handleBox = document.querySelector(".lie-crop-portal .lie-crop-handles");
      if (!handleBox) return { fatal: "no .lie-crop-handles (crop did not start)" };
      const cb = handleBox.getBoundingClientRect();
      const rf = img.closest(".lie-frame").getBoundingClientRect();  // the in-host RESULT (cut) window
      // The dim surround is the GHOST img in the body portal (Variante B: it escaped the host's
      // honoured contain:paint). elementFromPoint returns it only if it actually PAINTS there AND is
      // hit-testable (pointer-events:auto = the pan surface) — exactly the veil-portal canary.
      const isVeil = (el) => !!(el && el.closest(".lie-crop-portal") &&
        (el.classList.contains("lie-crop-ghost-img") || el.tagName === "IMG"));
      // probe IN the dim ghost band — midway between the RESULT (cut) edge and the image edge (the
      // ghost fills exactly that band when zoomed), off the handle positions.
      const pL = document.elementFromPoint((cb.left + rf.left) / 2, rf.top + rf.height * 0.3);
      const pR = document.elementFromPoint((cb.right + rf.right) / 2, rf.top + rf.height * 0.7);
      return {
        ok: true,
        cut: { x: cb.left, y: cb.top, w: cb.width, h: cb.height },
        result: { x: rf.left, y: rf.top, w: rf.width, h: rf.height },  // the in-host bright result (hole)
        // the native resize handle is gone/inert: the pre-crop corner point is no longer it
        handleInert: !document.elementFromPoint(${cornerPt.x}, ${cornerPt.y})?.closest(".image-resize-corner"),
        overflowLeft: isVeil(pL),
        overflowRight: isVeil(pR),
      };
    })()`);
    if (!crop || crop.fatal) throw new Error("crop: " + (crop?.fatal || "no result"));

    // frame still outlines the cut/resulting image during crop (accent border at the cut edge —
    // dashed, so a lower bar). Clip a few px wider so the left border sits inside the capture.
    const cutClip = { x: crop.cut.x - 3, y: crop.cut.y, width: crop.cut.w + 6, height: crop.cut.h };
    const cropFrame = await cdp.screenshot(cutClip);
    const fracFrameCrop = edgeAccentFraction(cropFrame, cutClip, accent, { dxs: [2, 3, 4, 5], y0: 0.1, y1: 0.9 });

    // 5b (optical) — the dim ghost surround is SOLID: NO editor-background holes (the clip-path
    // triangle artifact — a single polygon()'s connecting edges sliced two wedges into the LEFT
    // surround). Sample the LEFT ghost band over the image's dark lower content (where the dim ghost
    // reads clearly darker than the editor bg) and count background-coloured pixels; a hole shows pure
    // bg. This is the PIXEL scan that the 2-point hit-test (5) structurally cannot do — it catches a
    // wedge BETWEEN the probes. (First-cut threshold; assumes a light theme over dark image content.)
    const bg = parseColor(await cdp.evaluate(`(() => { const p = document.createElement("div"); p.style.background = "var(--background-primary)"; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; })()`));
    const bandW = Math.round(crop.result.x - crop.cut.x);   // left ghost band: image-left → result-left
    let ghostSolid = true, bandBgFrac = 0;
    if (bandW >= 12 && bg) {
      const band = { x: crop.cut.x + 2, y: Math.round(crop.result.y + crop.result.h * 0.45), width: bandW - 4, height: Math.round(crop.result.h * 0.5) };
      const shot = await cdp.screenshot(band);
      let tot = 0, bgHit = 0;
      for (let y = 0; y < shot.height; y += 2) for (let x = 0; x < shot.width; x += 2) { tot++; if (near(pixel(shot, x, y), bg, 26)) bgHit++; }
      bandBgFrac = tot ? bgHit / tot : 0;
      ghostSolid = bandBgFrac < 0.2;
    }

    await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      if (plugin.closeCrop) plugin.closeCrop();
      await new Promise(r => setTimeout(r, 150));
    })()`);

    // ---- report ----
    const checks = [
      ["1. hover: native resize handle is GRABBABLE at the image corner (D4)", handleHittable === true],
      ["1b. hover: resize handle marker FULLY visible at the corner, not contain-clipped (D4)  [optical]", markerFullyVisible],
      ["2. hover: a selection FRAME is painted around the image (D15)  [optical]", fracFrameHover > 0.5],
      ["3. crop: the resize handle is ABSENT / inert (D4)", crop.handleInert === true],
      ["4. crop: an accent FRAME outlines the cut/resulting image (D15)  [optical]", fracFrameCrop > 0.2],
      ["5b. crop: dim ghost surround SOLID — no background holes/triangles (left band, optical)", ghostSolid],
      ["5. crop: dim surround PAINTED + hit-testable outside the result window — left edge (veil-portal canary, D8/D15)", crop.overflowLeft === true],
      ["5. crop: dim surround PAINTED + hit-testable outside the result window — right edge (veil-portal canary, D8/D15)", crop.overflowRight === true],
    ];
    let failed = 0;
    for (const [name, ok] of checks) {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
      if (!ok) failed++;
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    console.log(`  (frame-hover accent fraction ${fracFrameHover.toFixed(2)}, frame-crop ${fracFrameCrop.toFixed(2)}, ghost-band bg-fraction ${bandBgFrac.toFixed(2)})`);
    if (failed) {
      console.error("\nResize affordance FAILED — note: check 5 is the veil-portal canary: the dim surround");
      console.error("must paint + hit-test through the body portal (escaping the host's honoured contain:paint).");
      process.exitCode = 1;
    } else {
      console.log("resize affordance OK");
    }
  } finally {
    if (setupDone) {
      await cdp.evaluate(`(async () => {
        try { const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}); if (f) await app.vault.delete(f); } catch (e) {}
      })()`).catch(() => {});
    }
    cdp.close();
  }
}

main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(2); });
