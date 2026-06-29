#!/usr/bin/env node
// OPTICAL RENDER GEOMETRY — area A of the black-box / optical-regression suite (test-plan §4).
// It OBSERVES the rendered layout (getBoundingClientRect of the real image box, caption and editor
// content) — never CSS properties — so it survives CSS refactors AND Obsidian updates. Run against a
// DEV build in vault-image-toolbar/ with Obsidian + the CDP relay (CLAUDE.md → "Live debugging"):
//   node tests/cdp/verify-optical-render.mjs        (CDP_PORT defaults to 9223, target vault-image-toolbar)
//
// Checks (each a requirement that should already be implemented):
//   • column cap (D3)          — a no-width image fits the text column and is not upscaled
//   • rotate 90 (F10/AD6)      — the footprint box swaps W/H (rotated-AABB reflow)
//   • rotate 180 (F10)         — the footprint is unchanged
//   • flip h (F10)             — same footprint as the un-flipped image
//   • block-center (F15)       — the image is centred in the column (equal left/right gaps)
//   • block-left (F15)         — the image hugs the column's left edge
//   • caption below (F22/D9)   — the caption sits below the image
//   • caption width (D9)       — the caption is never wider than the image

import { connectOptical } from "./_optical.mjs";

const FIXTURE = "_optical-render-fixture.md";

// Build the fixture, open in LP, enable captions, then measure every image box + the caption + the
// editor content box in ONE pass (rects in viewport CSS px). Returns a record keyed per scenario.
const MEASURE = `(async () => {
  const plugin = app.plugins.plugins["live-image-editor"];
  if (!plugin) return { fatal: "plugin not loaded" };
  const vault = app.vault;
  const L = [
    "# Optical render fixture", "",
    "intro paragraph text", "",
    "![](images/sample-landscape.png)", "",                                 // 5  plain → column cap
    "![R90](images/sample-landscape.png){rotate=90 width=200}", "",         // 7  rotate 90
    "![](images/sample-landscape.png){rotate=180 width=200}", "",           // 9  rotate 180
    "![](images/sample-landscape.png){flip=horizontal width=200}", "",      // 11 flip h
    "![BC](images/sample-landscape.png){align=block-center width=160}", "", // 13 block-center
    "![](images/sample-landscape.png){align=block-left width=160}", "",     // 15 block-left
    "![a caption here](images/sample-landscape.png){width=200}", "",        // 17 caption
    "![](images/sample-landscape.png){align=left width=140}", "",           // 19 float-left
    "this paragraph wraps beside the floated image to its right and runs on long enough that it clearly sits beside the image rather than dropping below it", "", // 21 wrap text
    "inline before ![](images/sample-square.png){.lie-inline width=48} inline after", "", // 23 inline icon (inline layout + small size)
    "tail text", "",
  ].join("\\n");
  let f = vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
  if (f) await vault.modify(f, L); else f = await vault.create(${JSON.stringify(FIXTURE)}, L);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise(r => setTimeout(r, 1800));
  const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
  const cm = ed && ed.cm;
  if (!ed || !cm) return { fatal: "no editor/cm (open the fixture in Live Preview)" };
  plugin.settings.showCaptions = true;
  if (plugin.refreshLivePreviewDecorations) plugin.refreshLivePreviewDecorations();

  const wrappers = () => Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block,.lie-wrapper"));
  const at = (n) => wrappers().find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === n; } catch (e) { return false; } });
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const measure = (n) => {
    const wrap = at(n);
    if (!wrap) return { missing: true };
    const img = wrap.querySelector("img");
    const area = wrap.querySelector(".lie-image-area") || img;
    const cap = wrap.querySelector(".lie-caption");
    return { area: rect(area), img: rect(img), caption: rect(cap),
             nat: img ? { w: img.naturalWidth, h: img.naturalHeight } : null };
  };
  const wrapTextRect = () => {
    const wl = Array.from(document.querySelectorAll(".cm-line")).find((l) => l.textContent.includes("wraps beside"));
    if (!wl) return null;
    const rg = document.createRange(); rg.selectNodeContents(wl); const rs = rg.getClientRects();
    return rs.length ? { x: rs[0].left, y: rs[0].top, r: rs[0].right, b: rs[0].bottom } : null;
  };
  // CM6 only renders lines near the viewport, so a tall multi-image doc leaves the lower images
  // un-rendered. Scroll each scenario into view before measuring it (and settle the float layout).
  const content = rect(cm.contentDOM);
  const scrollTo = async (n) => {
    try { ed.scrollIntoView({ from: { line: n - 1, ch: 0 }, to: { line: n - 1, ch: 0 } }, true); } catch (e) {}
    await new Promise(r => setTimeout(r, 350));
  };
  const grab = async (n) => { await scrollTo(n); return measure(n); };
  const M = { ok: true, content };
  M.plain = await grab(5); M.rot90 = await grab(7); M.rot180 = await grab(9); M.flip = await grab(11);
  M.blockCenter = await grab(13); M.blockLeft = await grab(15); M.cap = await grab(17);
  // float + its wrapped paragraph: scroll there, then settle until the text is pushed beside the image
  await scrollTo(19); M.float = measure(19);
  for (let i = 0; i < 12; i++) {
    const wt = wrapTextRect();
    if (M.float.area && wt && wt.x >= M.float.area.r - 10) break;
    await new Promise(r => setTimeout(r, 250));
    M.float = measure(19);
  }
  M.wrap = rect(Array.from(document.querySelectorAll(".cm-line")).find((l) => l.textContent.includes("wraps beside")));
  M.wrapText = wrapTextRect();
  // inline icon (line 23)
  await scrollTo(23);
  const inlineArea = document.querySelector(".lie-image-area.lie-inline");
  const inlineLine = Array.from(document.querySelectorAll(".cm-line")).find((l) => l.textContent.includes("inline before"));
  M.inline = { area: rect(inlineArea), img: rect(inlineArea && inlineArea.querySelector("img")), line: rect(inlineLine) };
  return M;
})()`;

// Switch the leaf to reading view, measure the same images (in source/occurrence order — AB3), then
// restore the original view state. Verifies both adapters produce the same visual result (F4/AD4).
const BOTH_VIEWS = `(async () => {
  const leaf = app.workspace.getMostRecentLeaf() || app.workspace.activeLeaf;
  if (!leaf) return { fatal: "no leaf" };
  const orig = leaf.getViewState();
  try {
    const st = leaf.getViewState(); st.state = Object.assign({}, st.state, { mode: "preview" });
    await leaf.setViewState(st);
    await new Promise(r => setTimeout(r, 900));
    const root = document.querySelector(".markdown-reading-view, .markdown-preview-view");
    const areas = root ? Array.from(root.querySelectorAll(".lie-image-area")) : [];
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, w: b.width, h: b.height, r: b.right }; };
    const contentEl = root && (root.querySelector(".markdown-preview-sizer") || root);
    const content = rect(contentEl);
    // match by the image's distinctive alt text (robust to view-specific wrapping/order)
    const byAlt = (a) => areas.find((ar) => { const i = ar.querySelector("img"); return i && i.alt === a; });
    return { ok: true, count: areas.length, content, rot90: rect(byAlt("R90")), blockCenter: rect(byAlt("BC")) };
  } finally {
    await leaf.setViewState(orig);
    await new Promise(r => setTimeout(r, 500));
  }
})()`;

async function main() {
  const cdp = await connectOptical();
  let setupDone = false;
  try {
    const m = await cdp.evaluate(MEASURE);
    setupDone = true;
    if (!m || m.fatal || !m.ok) throw new Error("measure: " + JSON.stringify(m));
    const rv = await cdp.evaluate(BOTH_VIEWS).catch((e) => ({ fatal: String(e.message || e) }));

    const C = m.content;
    const aspect = (r) => (r && r.h ? r.w / r.h : 0);
    const natAspect = m.plain.nat ? m.plain.nat.w / m.plain.nat.h : 1.5; // sample-landscape ≈ 1.5
    const approx = (a, b, tol) => Math.abs(a - b) <= tol;

    const checks = [];
    // column cap (D3): no-width image fits the column and is not upscaled past its natural width
    checks.push(["column cap: no-width image ≤ text column, not upscaled (D3)",
      !!m.plain.area && m.plain.area.w <= C.w + 2 && (!m.plain.nat || m.plain.area.w <= m.plain.nat.w + 2)]);
    // rotate 90: footprint aspect is the SWAPPED intrinsic aspect (w↔h)
    checks.push(["rotate 90: footprint box swaps W/H (F10/AD6)",
      !!m.rot90.area && approx(aspect(m.rot90.area), 1 / natAspect, 0.15)]);
    // rotate 180: footprint aspect unchanged
    checks.push(["rotate 180: footprint unchanged (F10)",
      !!m.rot180.area && approx(aspect(m.rot180.area), natAspect, 0.15)]);
    // flip h: same footprint as the (un-flipped) rotate-180 sibling at the same width
    checks.push(["flip h: footprint unchanged vs un-flipped (F10)",
      !!m.flip.area && !!m.rot180.area && approx(m.flip.area.w, m.rot180.area.w, 3) && approx(m.flip.area.h, m.rot180.area.h, 3)]);
    // block-center: equal gaps to the content's left and right edges
    if (m.blockCenter.area) {
      const gapL = m.blockCenter.area.x - C.x, gapR = C.r - m.blockCenter.area.r;
      checks.push(["block-center: centred in the column (F15)", gapL > 4 && gapR > 4 && approx(gapL, gapR, 6)]);
    } else checks.push(["block-center: centred in the column (F15)", false]);
    // block-left: hugs the content's left edge (gap clearly smaller than the centred case)
    checks.push(["block-left: hugs the column's left edge (F15)",
      !!m.blockLeft.area && Math.abs(m.blockLeft.area.x - C.x) <= 4]);
    // caption below the image
    checks.push(["caption: sits below the image (F22/D9)",
      !!m.cap.caption && !!m.cap.img && m.cap.caption.y >= m.cap.img.b - 2]);
    // caption never wider than the image
    checks.push(["caption: never wider than the image (D9)",
      !!m.cap.caption && !!m.cap.img && m.cap.caption.w <= m.cap.img.w + 2]);
    // float-left: image hugs the left AND the following text wraps BESIDE it (overlaps vertically,
    // starts to its right) rather than below it (F18)
    if (m.float.area && m.wrapText) {
      const besideRight = m.wrapText.x >= m.float.area.r - 10;
      const overlapsVert = m.wrapText.y < m.float.area.b - 8;
      checks.push(["float-left: following text wraps BESIDE the image (F18)",
        Math.abs(m.float.area.x - C.x) <= 6 && besideRight && overlapsVert]);
    } else checks.push(["float-left: following text wraps BESIDE the image (F18)", false]);
    // inline icon: an inline-layout image at a small size renders small AND within a text line
    if (m.inline.area && m.inline.line) {
      checks.push(["inline: small inline image flows within a text line (F17)",
        m.inline.area.h < 80 && m.inline.area.w < 80 && m.inline.line.w > m.inline.area.w + 20]);
    } else checks.push(["inline: small inline image flows within a text line (F17)", false]);
    // both views identical (F4/AD4): reading view reproduces the LP geometry — rotate-90 swaps the
    // footprint there too, and block-center is centred there too
    if (rv && rv.ok && rv.rot90 && rv.blockCenter && rv.content) {
      const rvRotOk = approx(aspect(rv.rot90), 1 / natAspect, 0.15);
      const gapL = rv.blockCenter.x - rv.content.x, gapR = rv.content.r - rv.blockCenter.r;
      const rvCenterOk = gapL > 4 && gapR > 4 && approx(gapL, gapR, 8);
      checks.push(["both views: reading view reproduces LP geometry — rotate-90 + block-center (F4/AD4)", rvRotOk && rvCenterOk]);
    } else checks.push([`both views: reading view reproduces LP geometry (F4/AD4) [${rv && rv.fatal ? rv.fatal : "no reading-view boxes"}]`, false]);

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    if (failed) { console.error("\nOptical render FAILED — reading-view:", JSON.stringify(rv), "\nLP measurements:", JSON.stringify(m, null, 2)); process.exitCode = 1; }
    else console.log("optical render OK");
  } finally {
    if (setupDone) {
      await cdp.evaluate(`(async () => {
        try { const p = app.plugins.plugins["live-image-editor"]; if (p) p.settings.showCaptions = false; } catch (e) {}
        try { const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}); if (f) await app.vault.delete(f); } catch (e) {}
      })()`).catch(() => {});
    }
    cdp.close();
  }
}

main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(2); });
