#!/usr/bin/env node
// OPTICAL CHROME / UX — area C of the black-box / optical-regression suite (test-plan §4). It drives
// the running app and OBSERVES the editing chrome by real hover + pointer hit-tests + geometry (never
// CSS properties). Run against a DEV build in example-vault/ with Obsidian + the CDP relay:
//   node tests/cdp/verify-optical-chrome.mjs        (CDP_PORT defaults to 9223, target example-vault)
//
// Checks:
//   • toolbar on hover (D1/F7)      — hovering the image makes a toolbar button GRABBABLE
//   • toolbar inset at top (D1)     — the toolbar sits at the image's top, within its bounds
//   • filter panel beside (D6/D7)   — the open filter panel docks to a side of the image…
//   • toolbar greyed while open (D6) — …and the toolbar is marked inactive (greyed) while it is open
//   • crop handles grabbable (D8)   — in crop, all 8 resize handles + the rotate knob are hit-testable
//   • too-small → floating bar (D1.1) — a tiny image shows the toolbar floating ABOVE it

import { connectOptical, pixel, parseColor, near } from "./_optical.mjs";

// Resolve a CSS colour var to concrete rgb() via a probe element (the var is hsl()/hex/etc.).
const ACCENT_PROBE = (varName) => `(() => { const p = document.createElement("div"); p.style.color = "var(${varName})"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`;
// Fraction of a screenshot's pixels that are ~the accent colour (a painted accent affordance).
function accentFraction(img, accent, tol = 100) {
  let hit = 0, tot = 0;
  for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) { tot++; if (near(pixel(img, x, y), accent, tol)) hit++; }
  return tot ? hit / tot : 0;
}

const FIXTURE = "_optical-chrome-fixture.md";

const SETUP = `(async () => {
  const plugin = app.plugins.plugins["live-image-editor"];
  if (!plugin) return { fatal: "plugin not loaded" };
  const vault = app.vault;
  const L = [
    "# chrome fixture", "",
    "![](images/sample-landscape.png){width=300}", "",   // 3 normal
    "![](images/sample-square.png){width=40}", "",        // 5 too-small
    "tail", "",
  ].join("\\n");
  let f = vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
  if (f) await vault.modify(f, L); else f = await vault.create(${JSON.stringify(FIXTURE)}, L);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise(r => setTimeout(r, 1300));
  const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
  const cm = ed && ed.cm;
  if (!ed || !cm) return { fatal: "no editor/cm (open in Live Preview)" };
  const wrappers = () => Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block,.lie-wrapper"));
  const at = (n) => wrappers().find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === n; } catch (e) { return false; } });
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const big = at(3), small = at(5);
  window.__chromeBig = big; window.__chromeSmall = small;
  return { ok: true, big: rect(big && big.querySelector("img")), small: rect(small && small.querySelector("img")) };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cdp = await connectOptical();
  let setupDone = false;
  try {
    const s = await cdp.evaluate(SETUP);
    setupDone = true;
    if (!s || s.fatal || !s.ok || !s.big) throw new Error("setup: " + JSON.stringify(s));
    const B = s.big;
    const accent = parseColor(await cdp.evaluate(ACCENT_PROBE("--color-accent")));
    const accentI = parseColor(await cdp.evaluate(ACCENT_PROBE("--interactive-accent"))) || accent;

    // (1)(2) hover the big image → a toolbar button is hittable, and the toolbar sits inset at the top
    await cdp.hover(B.x + B.w / 2, B.y + B.h / 2);
    await sleep(250);
    const hov = await cdp.evaluate(`(() => {
      const wrap = window.__chromeBig; if (!wrap) return { fatal: "no wrap" };
      const bar = wrap.querySelector(".lie-toolbar-in-image") || document.querySelector(".lie-toolbar-floating");
      const btn = bar && bar.querySelector(".lie-toolbar-btn, .lie-toolbar-group-trigger");
      if (!bar || !btn) return { barFound: !!bar, btnHit: false, inset: false };
      const r = btn.getBoundingClientRect();
      const hitEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const br = bar.getBoundingClientRect();
      const img = wrap.querySelector("img").getBoundingClientRect();
      return {
        btnHit: !!(hitEl && hitEl.closest(".lie-toolbar-btn, .lie-toolbar-group-trigger")),
        inset: br.top >= img.top - 2 && br.top <= img.top + 48 && br.left >= img.left - 2,
      };
    })()`);

    // (2b) the resize handle MARKER must be VISIBLE (painted) AND not contain-clipped. It MIRRORS
    // Obsidian's native handle (D4): the dot sits flush in the corner (its accent ring mostly INSIDE
    // the image) with only its 2px outline bleeding ~2px OUTSIDE. So a 24px box straddling the corner
    // must carry accent BOTH inside the corner (the ring body, mIn) AND in the outside band (the 2px
    // bleed, mOut); a containment clip eats the outside bleed → mOut == 0 → FAIL. (The block-layout
    // clip itself is exercised in verify-resize-affordance; here the image is standalone/unclipped.)
    const cornerShot = await cdp.screenshot({ x: B.x + B.w - 12, y: B.y + B.h - 12, width: 24, height: 24 });
    let mIn = 0, mOut = 0;
    { const sx = cornerShot.width / 24, sy = cornerShot.height / 24;
      for (let yy = 0; yy < 24; yy++) for (let xx = 0; xx < 24; xx++) {
        if (near(pixel(cornerShot, xx * sx, yy * sy), accent, 80)) (xx >= 12 || yy >= 12) ? mOut++ : mIn++;
      } }
    const resizeHandleVisible = mIn > 0 && mOut > 0;

    // (3)(4) open the filter panel → it docks beside the image, toolbar greyed (inactive)
    const filt = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      const wrap = window.__chromeBig; const img = wrap.querySelector("img");
      plugin.activeImage = img;
      plugin.toggleFilters();
      await new Promise(r => setTimeout(r, 350));
      const panel = document.querySelector(".lie-submenu .lie-filter-body") ? document.querySelector(".lie-submenu") : null;
      const greyed = !!document.querySelector(".lie-toolbar-inactive");
      let beside = false;
      if (panel) {
        const p = panel.getBoundingClientRect(); const i = img.getBoundingClientRect();
        // docked to a side: panel sits essentially left OR right of the image (not overlapping its centre column)
        beside = p.left >= i.right - 8 || p.right <= i.left + 8;
      }
      plugin.toggleFilters();
      await new Promise(r => setTimeout(r, 150));
      return { panelFound: !!panel, beside, greyed };
    })()`);

    // (5) crop → all 8 handles + rotate knob are hit-testable at their centres
    const crop = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      const wrap = window.__chromeBig; const img = wrap.querySelector("img");
      plugin.activeImage = img; plugin.crop();
      await new Promise(r => setTimeout(r, 350));
      // The handle chrome lives in the body portal now (Variante B), not under the in-host area.
      const keys = ["nw","ne","sw","se","n","s","e","w"];
      let hit = 0;
      for (const k of keys) {
        const el = document.querySelector(".lie-crop-portal .lie-crop-handle-" + k); if (!el) continue;
        const b = el.getBoundingClientRect();
        const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (at && at.closest(".lie-crop-handle-" + k)) hit++;
      }
      const rot = document.querySelector(".lie-crop-portal .lie-crop-rotation-handle");
      let rotHit = false;
      if (rot) { const b = rot.getBoundingClientRect(); const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); rotHit = !!(at && at.closest(".lie-crop-rotation-handle")); }
      if (plugin.closeCrop) plugin.closeCrop();
      await new Promise(r => setTimeout(r, 150));
      return { handlesHit: hit, rotHit };
    })()`);

    // (5b) the crop handles must be VISIBLE (painted accent squares), not merely grabbable. Open
    // crop, screenshot a box around the SE corner handle, require a chunk of accent pixels; a
    // clipped/invisible handle (containment eating it) = FAIL — same visibility bar as the resize handle (D8).
    const cropVis = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      const wrap = window.__chromeBig; const img = wrap.querySelector("img");
      plugin.activeImage = img; plugin.crop();
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector(".lie-crop-portal .lie-crop-handle-se") || document.querySelector(".lie-crop-handle-se");
      if (!el) return { fatal: "no se crop handle" };
      const b = el.getBoundingClientRect();
      return { rect: { x: b.left, y: b.top, w: b.width, h: b.height } };
    })()`);
    let cropHandleVisible = false;
    if (cropVis && cropVis.rect && cropVis.rect.w > 0) {
      const r = cropVis.rect;
      const shot = await cdp.screenshot({ x: r.x - 5, y: r.y - 5, width: r.w + 10, height: r.h + 10 });
      cropHandleVisible = accentFraction(shot, accentI, 100) > 0.12;
    }
    await cdp.evaluate(`(async () => { const p = app.plugins.plugins["live-image-editor"]; if (p.closeCrop) p.closeCrop(); await new Promise(r => setTimeout(r, 150)); })()`);

    // (6) tiny image → the toolbar floats ABOVE it (D1.1)
    let tinyFloat = { floating: false, above: false };
    if (s.small) {
      await cdp.hover(s.small.x + s.small.w / 2, s.small.y + s.small.h / 2);
      await sleep(300);
      tinyFloat = await cdp.evaluate(`(() => {
        const bar = document.querySelector(".lie-toolbar-floating");
        if (!bar) return { floating: false, above: false };
        const wrap = window.__chromeSmall; const img = wrap && wrap.querySelector("img");
        const br = bar.getBoundingClientRect(); const ir = img ? img.getBoundingClientRect() : null;
        return { floating: br.width > 0 && br.height > 0, above: !!ir && br.bottom <= ir.top + 4 };
      })()`);
    }

    const checks = [
      ["toolbar appears on hover — a button is grabbable (D1/F7)", hov.btnHit === true],
      ["toolbar sits inset at the image top (D1)", hov.inset === true],
      ["filter panel docks beside the image (D6/D7)", filt.panelFound === true && filt.beside === true],
      ["toolbar is greyed (inactive) while the panel is open (D6)", filt.greyed === true],
      ["resize handle MARKER is VISIBLE / not clipped, not just grabbable (D4)", resizeHandleVisible === true],
      ["crop: all 8 resize handles are grabbable (D8)", crop.handlesHit === 8],
      ["crop: the rotate knob is grabbable (D8)", crop.rotHit === true],
      ["crop handles are VISIBLE / painted, not just grabbable (D8)", cropHandleVisible === true],
      ["too-small image: the toolbar floats ABOVE it (D1.1)", tinyFloat.floating === true && tinyFloat.above === true],
    ];
    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    console.log("  raw:", JSON.stringify({ hov, filt, crop, tinyFloat, resizeHandleVisible, cropHandleVisible, mIn, mOut }));
    if (failed) { console.error("\nOptical chrome FAILED"); process.exitCode = 1; }
    else console.log("optical chrome OK");
  } finally {
    if (setupDone) {
      await cdp.evaluate(`(async () => {
        try { const p = app.plugins.plugins["live-image-editor"]; if (p) { if (p.closeCrop) p.closeCrop(); if (p.toggleFilters && document.querySelector(".lie-submenu")) p.toggleFilters(); } } catch (e) {}
        try { const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}); if (f) await app.vault.delete(f); } catch (e) {}
        try { delete window.__chromeBig; delete window.__chromeSmall; } catch (e) {}
      })()`).catch(() => {});
    }
    cdp.close();
  }
}

main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(2); });
