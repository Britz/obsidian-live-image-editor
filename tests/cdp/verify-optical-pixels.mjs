#!/usr/bin/env node
// OPTICAL RENDER PIXELS — area B of the black-box / optical-regression suite (test-plan §4). It
// captures the rendered image and SAMPLES PIXELS to prove the content is actually transformed /
// filtered — not merely that a box has the right size (area A). Run against a DEV build in
// example-vault/ with Obsidian + the CDP relay:
//   node tests/cdp/verify-optical-pixels.mjs        (CDP_PORT defaults to 9223, target example-vault)
//
// The bundled sample images are left/right symmetric but top/bottom distinct, so the reliable axis
// is VERTICAL. Checks:
//   • rotate 180 (F10)   — content is vertically inverted (top strip ≈ the reference's BOTTOM)
//   • flip vertical (F10)— content is vertically mirrored (top strip ≈ the reference's BOTTOM)
//   • filter grayscale (F11) — the image is desaturated (R≈G≈B), the reference is not
// (flip-h / rotate-90 content can't be pixel-distinguished on these symmetric assets — their
// footprint is covered by verify-optical-render.mjs.)

import { connectOptical, pixel } from "./_optical.mjs";

const FIXTURE = "_optical-pixels-fixture.md";

const MEASURE = `(async () => {
  const plugin = app.plugins.plugins["live-image-editor"];
  if (!plugin) return { fatal: "plugin not loaded" };
  const vault = app.vault;
  const L = [
    "# pixel fixture", "",
    "![ref](images/sample-landscape.png){width=300}", "",                       // 3 reference
    "![r180](images/sample-landscape.png){rotate=180 width=300}", "",           // 5 rotate 180
    "![fv](images/sample-landscape.png){flip=vertical width=300}", "",          // 7 flip vertical
    "![g](images/sample-landscape.png){filter=\\"grayscale(1)\\" width=300}", "", // 9 grayscale
    "tail", "",
  ].join("\\n");
  let f = vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
  if (f) await vault.modify(f, L); else f = await vault.create(${JSON.stringify(FIXTURE)}, L);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise(r => setTimeout(r, 1500));
  const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
  if (!ed || !ed.cm) return { fatal: "no editor/cm (open in Live Preview)" };
  return { ok: true };
})()`;

// Scroll one image's line into the viewport (CM6 virtualizes a tall doc), settle, return its img rect
// — so the screenshot right after captures the fully-rendered, transformed image.
const SCROLL_RECT = (n) => `(async () => {
  const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
  const cm = ed && ed.cm;
  try { ed.scrollIntoView({ from: { line: ${n - 1}, ch: 0 }, to: { line: ${n - 1}, ch: 0 } }, true); } catch (e) {}
  await new Promise(r => setTimeout(r, 450));
  const at = Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block,.lie-wrapper"))
    .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === ${n}; } catch (e) { return false; } });
  const i = at && at.querySelector("img");
  if (!i || !i.complete || i.naturalWidth === 0) return null;
  const b = i.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
})()`;

const sat = (c) => Math.abs(c[0] - c[1]) + Math.abs(c[1] - c[2]);
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

// Average colour of a horizontal strip of the decoded screenshot (yFrac of the image height).
function strip(img, yFrac) {
  const y = Math.round(img.height * yFrac);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let x = Math.round(img.width * 0.2); x < Math.round(img.width * 0.8); x += 3) {
      const p = pixel(img, x, y + dy); r += p[0]; g += p[1]; b += p[2]; n++;
    }
  }
  return [r / n | 0, g / n | 0, b / n | 0];
}
const centre = (img) => strip(img, 0.5);

async function main() {
  const cdp = await connectOptical();
  let setupDone = false;
  try {
    const open = await cdp.evaluate(MEASURE);
    setupDone = true;
    if (!open || open.fatal || !open.ok) throw new Error("open: " + JSON.stringify(open));
    // Park the pointer in a neutral corner so no leftover :hover (from a prior script) paints a
    // toolbar / selection frame over an image's top edge and pollutes the pixel sample.
    await cdp.hover(2, 2);
    const shoot = async (n) => {
      const r = await cdp.evaluate(SCROLL_RECT(n));
      if (!r) throw new Error("image not rendered at line " + n);
      return cdp.screenshot({ x: r.x, y: r.y, width: r.w, height: r.h });
    };
    const ref = await shoot(3), rot180 = await shoot(5), flipV = await shoot(7), gray = await shoot(9);

    const refTop = strip(ref, 0.12), refBot = strip(ref, 0.88);
    const distinct = dist(refTop, refBot) > 8; // the asset must have a top/bottom difference to test against
    const r180Top = strip(rot180, 0.12);
    const fvTop = strip(flipV, 0.12);

    const checks = [
      ["reference image has a distinguishable top vs bottom (test precondition)", distinct],
      // rotate 180: the rendered TOP now shows the reference's BOTTOM content
      ["rotate 180: content vertically inverted (F10)",
        distinct && dist(r180Top, refBot) < dist(r180Top, refTop)],
      // flip vertical: same observable — TOP shows the reference's BOTTOM
      ["flip vertical: content vertically mirrored (F10)",
        distinct && dist(fvTop, refBot) < dist(fvTop, refTop)],
      // grayscale: the filtered image is desaturated while the reference is colourful
      ["filter grayscale: image desaturated, reference is not (F11)",
        sat(centre(gray)) < 16 && sat(centre(ref)) > 28],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    console.log(`  (refTop ${refTop} refBot ${refBot} · r180Top ${r180Top} · fvTop ${fvTop} · sat ref ${sat(centre(ref))} gray ${sat(centre(gray))})`);
    if (failed) { console.error("\nOptical pixels FAILED"); process.exitCode = 1; }
    else console.log("optical pixels OK");
  } finally {
    if (setupDone) {
      await cdp.evaluate(`(async () => { try { const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}); if (f) await app.vault.delete(f); } catch (e) {} })()`).catch(() => {});
    }
    cdp.close();
  }
}

main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(2); });
