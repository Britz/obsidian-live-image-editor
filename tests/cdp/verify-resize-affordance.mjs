#!/usr/bin/env node
// RESIZE AFFORDANCE — the first BLACK-BOX / OPTICAL slice of the test-coverage initiative
// (test-plan §4 "Resize affordance", D4 + D15). It OBSERVES the visible painted result — pixels and
// pointer hit-tests — NOT CSS properties, so it survives CSS refactors and Obsidian updates (the
// exact failure that motivated this layer: an Obsidian 1.12.7 specificity bump silently broke the
// crop containment-lift and no property-reading test caught it).
//
// What it checks (each by observation, never by reading `contain`/`display`/`box-shadow`):
//   1. selected/hover  → the native resize handle is GRABBABLE at the image's bottom-right corner
//                        (elementFromPoint there is the resize corner).                        [D4]
//   2. hover           → a selection FRAME is painted around the image (accent pixels along the
//                        inner edge that appear ONLY on hover — a hover/no-hover pixel diff).   [D15]
//   3. crop            → the same corner point is NO LONGER the resize handle: it is absent and
//                        inert while cropping.                                                  [D4]
//   4. crop            → an accent FRAME still outlines the cut / resulting image.              [D15]
//   5. crop            → the croppable image is PAINTED & HIT-TESTABLE OUTSIDE the cut window
//                        (the dim ghost overflows it). elementFromPoint just outside the cut
//                        returns the ghost image — this is the CONTAINMENT-LIFT canary: if
//                        Obsidian's `contain:paint` is not beaten, the overflow is clipped and
//                        this point hits the editor instead → FAIL. EXPECTED RED until the
//                        contain regression is fixed.                                           [D8/D15]
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
      const handleBox = area.querySelector(".lie-crop-handles");
      if (!handleBox) return { fatal: "no .lie-crop-handles (crop did not start)" };
      const cb = handleBox.getBoundingClientRect();
      const isGhost = (el) => !!(el && el.closest(".lie-image-area.lie-cropping") &&
        (el.classList.contains("lie-crop-ghost-img") || el.tagName === "IMG"));
      // probe OUTSIDE the cut window, off the handle positions (corners + edge midpoints)
      const pL = document.elementFromPoint(cb.left - 15, cb.top + cb.height * 0.25);
      const pR = document.elementFromPoint(cb.right + 15, cb.top + cb.height * 0.75);
      return {
        ok: true,
        cut: { x: cb.left, y: cb.top, w: cb.width, h: cb.height },
        // the native resize handle is gone/inert: the pre-crop corner point is no longer it
        handleInert: !document.elementFromPoint(${cornerPt.x}, ${cornerPt.y})?.closest(".image-resize-corner"),
        overflowLeft: isGhost(pL),
        overflowRight: isGhost(pR),
      };
    })()`);
    if (!crop || crop.fatal) throw new Error("crop: " + (crop?.fatal || "no result"));

    // frame still outlines the cut/resulting image during crop (accent border at the cut edge —
    // dashed, so a lower bar). Clip a few px wider so the left border sits inside the capture.
    const cutClip = { x: crop.cut.x - 3, y: crop.cut.y, width: crop.cut.w + 6, height: crop.cut.h };
    const cropFrame = await cdp.screenshot(cutClip);
    const fracFrameCrop = edgeAccentFraction(cropFrame, cutClip, accent, { dxs: [2, 3, 4, 5], y0: 0.1, y1: 0.9 });

    await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      if (plugin.closeCrop) plugin.closeCrop();
      await new Promise(r => setTimeout(r, 150));
    })()`);

    // ---- report ----
    const checks = [
      ["1. hover: native resize handle is GRABBABLE at the image corner (D4)", handleHittable === true],
      ["2. hover: a selection FRAME is painted around the image (D15)  [optical]", fracFrameHover > 0.5],
      ["3. crop: the resize handle is ABSENT / inert (D4)", crop.handleInert === true],
      ["4. crop: an accent FRAME outlines the cut/resulting image (D15)  [optical]", fracFrameCrop > 0.2],
      ["5. crop: croppable image OVERFLOWS the cut window — left edge (contain canary, D8/D15)", crop.overflowLeft === true],
      ["5. crop: croppable image OVERFLOWS the cut window — right edge (contain canary, D8/D15)", crop.overflowRight === true],
    ];
    let failed = 0;
    for (const [name, ok] of checks) {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
      if (!ok) failed++;
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    console.log(`  (frame-hover accent fraction ${fracFrameHover.toFixed(2)}, frame-crop ${fracFrameCrop.toFixed(2)})`);
    if (failed) {
      console.error("\nResize affordance FAILED — note: check 5 is the contain-regression canary and is");
      console.error("expected RED until the crop containment-lift is fixed for the running Obsidian version.");
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
