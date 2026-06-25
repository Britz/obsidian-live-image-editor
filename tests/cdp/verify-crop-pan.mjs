#!/usr/bin/env node
// CROP PAN HIT-AREA CHECK — the runnable, read-DOM-back structural guard for "pan must grab the
// WHOLE visible image, inside AND outside the cut frame" (an extension of the Bug-43 in-place crop).
//
// ROOT CAUSE it pins: in-place crop overflows the full image past the cut window; that overflow is
// the dim ghost (`.lie-crop-ghost-img`), which lives in the BODY PORTAL (Variante B). The veil box is
// `pointer-events:none`, so before the fix the img inherited it and the OUTSIDE-the-frame region was a
// non-target — the pan listener only fired from INSIDE the cut. The fix makes the ghost IMG the pan
// hit-surface (`pointer-events:auto`); the veil box stays click-through and the chrome/handles still
// catch their own events. This check proves, via real hit-testing (`elementFromPoint`), that:
//   • the pan layer (ghost img) is hit-testable, the veil box + chrome overlay are `none`;
//   • a pan STARTED OUTSIDE the cut frame (on the overflow img) translates the live img;
//   • a pan started INSIDE the cut frame also translates it;
//   • a handle/rotate knob still wins its own hit (elementFromPoint on a handle = the handle);
//   • leaving crop tears the ghost/chrome down (full teardown: tests/cdp/verify-crop-teardown.mjs).
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build installed in example-vault/ and Obsidian running with
// the CDP relay. Run from the repo root:  node tests/cdp/verify-crop-pan.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults: host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "example-vault").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "example-vault",
};

const EVAL_RUN = `(async () => {
  window.__CROPPAN = "";
  const R = {};
  const ok = (k, v) => { R[k] = !!v; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Dispatch a pointer drag and report whether the live img placement transform changed (= pan grabbed).
  const dragPan = (el, px, py, dx, dy) => {
    const before = img.style.transform;
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: px, clientY: py, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: px + dx, clientY: py + dy, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return img.style.transform !== before;
  };
  let img;
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__CROPPAN = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_crop-pan-fixture.md";
    const content = ["# Crop pan fixture", "", "![](images/sample-landscape.png)", ""].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await wait(1200);
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__CROPPAN = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const LINE = 3;
    const wrap = Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
      .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === LINE; } catch (e) { return false; } });
    img = wrap && wrap.querySelector("img");
    if (!img) { await vault.delete(f); window.__CROPPAN = JSON.stringify({ fatal: "no image at line 3" }); return; }
    plugin.activeImage = img;

    plugin.crop();
    await wait(250);
    const area = img.closest(".lie-image-area");
    const host = img.closest(".lie-wrapper, .image-embed");
    const frameEl = img.closest(".lie-frame");
    if (!area || !frameEl) { await vault.delete(f); window.__CROPPAN = JSON.stringify({ fatal: "crop did not enter (no area/frame)" }); return; }

    const se = document.querySelector(".lie-crop-portal .lie-crop-handle-se");  // chrome is in the body portal (Variante B)

    // --- A handle still wins its own hit (no collision with the pan layer). Checked at scale 1, with
    // the handle ON-SCREEN at the cut corner — a large scale-up would push the corner handle off the
    // editor pane, so elementFromPoint must be read before zooming, not after. ---
    const hr0 = se ? se.getBoundingClientRect() : null;
    const hHit = hr0 ? document.elementFromPoint(hr0.left + hr0.width / 2, hr0.top + hr0.height / 2) : null;
    ok("handleSeparate", !!hHit && hHit.dataset && hHit.dataset.handle === "se");

    // SCALE UP via a real corner-handle drag so the full image clearly OVERFLOWS the cut window
    // (otherwise an un-cropped image fits the frame exactly and there is no outside region to grab).
    if (se) {
      const h = se.getBoundingClientRect();
      const hx = h.left + h.width / 2, hy = h.top + h.height / 2;
      se.dispatchEvent(new PointerEvent("pointerdown", { clientX: hx, clientY: hy, bubbles: true }));
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: hx + 160, clientY: hy + 160, bubbles: true }));
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      await wait(60);
    }

    // The scale-up preview can rebuild the box, detaching the captured area/frame refs — re-query the
    // LIVE cropping area from the document so the hit-tests run against the on-screen chrome (and bail
    // with a clear diagnostic instead of dereferencing null if a render churn dropped the ghost).
    const liveArea = document.querySelector(".lie-image-area.lie-cropping") || area;
    const liveFrame = liveArea.querySelector(".lie-frame") || frameEl;
    // Variante B: the ghost + chrome live in the BODY PORTAL (escaping the host's honoured
    // contain:paint), not under the in-host area — query them there.
    const ghostImg = document.querySelector(".lie-crop-portal .lie-crop-ghost-img");
    const ghostBox = document.querySelector(".lie-crop-portal .lie-crop-veil");
    const chrome = document.querySelector(".lie-crop-portal .lie-crop-chrome");
    if (!ghostImg) { await vault.delete(f); window.__CROPPAN = JSON.stringify({ fatal: "no ghost img after scale-up (render churn — re-run)", checks: R }); return; }

    // --- Layer pointer-events: the pan layer catches, the frame box + the chrome overlay do not ---
    ok("panLayerCatches", ghostImg && getComputedStyle(ghostImg).pointerEvents !== "none");
    ok("ghostBoxClickThrough", ghostBox && getComputedStyle(ghostBox).pointerEvents === "none");
    ok("chromeOverlayNone", chrome && getComputedStyle(chrome).pointerEvents === "none");

    const fr = liveFrame.getBoundingClientRect();
    const gr = ghostImg.getBoundingClientRect();
    ok("imageOverflowsCut", gr.right > fr.right + 8 && gr.left < fr.left - 8); // the overflow band exists

    // --- OUTSIDE the cut frame, on the overflow img: the point hits the ghost, and a pan grabs ---
    const ox = fr.right + 20, oy = fr.top + fr.height / 2;
    const outEl = document.elementFromPoint(ox, oy);
    ok("outsideHitsGhost", !!outEl && outEl.classList.contains("lie-crop-ghost-img"));
    ok("outsidePanGrabs", outEl ? dragPan(outEl, ox, oy, 34, 20) : false);

    // --- INSIDE the cut frame: the point hits the live image (NOT the ghost), and a pan grabs ---
    const ix = fr.left + fr.width / 2, iy = fr.top + fr.height / 2;
    const inEl = document.elementFromPoint(ix, iy);
    ok("insideHitsImageNotGhost", !!inEl && !inEl.classList.contains("lie-crop-ghost-img") &&
       (inEl === img || inEl.closest(".lie-frame") != null));
    ok("insidePanGrabs", inEl ? dragPan(inEl, ix, iy, 28, 16) : false);

    // --- Leaving crop tears the transient chrome down (full teardown = verify-crop-teardown.mjs) ---
    plugin.closeCrop();
    await wait(250);
    ok("teardownNoGhost", !document.querySelector(".lie-crop-ghost-img"));
    ok("teardownNotCropping", !document.querySelector(".lie-cropping"));

    await vault.delete(f);
    window.__CROPPAN = JSON.stringify({ checks: R });
  } catch (e) { window.__CROPPAN = JSON.stringify({ fatal: String((e && e.stack) || e), checks: R }); }
})()`;

const EVAL_READ = `window.__CROPPAN || ""`;

function parseResult(out) {
  for (const raw of out.trim().split("\n").reverse()) {
    const line = raw.trim();
    if (!line.startsWith('"') && !line.startsWith("{")) continue;
    try {
      const once = JSON.parse(line);
      const obj = typeof once === "string" ? (once ? JSON.parse(once) : null) : once;
      if (obj) return obj;
    } catch { /* keep scanning */ }
  }
  return null;
}

function sleep(ms) { execFileSync("node", ["-e", `setTimeout(()=>{}, ${ms})`]); }

function runEval() {
  execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_RUN], { env, encoding: "utf8" });
  for (let i = 0; i < 25; i++) {
    sleep(1000);
    const out = execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_READ], { env, encoding: "utf8" });
    const res = parseResult(out);
    if (res) return res;
  }
  throw new Error("timed out waiting for window.__CROPPAN (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }
const c = res.checks ?? {};
const order = [
  ["pan layer (ghost img) is hit-testable (pointer-events != none)", "panLayerCatches"],
  ["ghost frame box stays click-through (pointer-events: none)", "ghostBoxClickThrough"],
  ["chrome overlay does not block (pointer-events: none)", "chromeOverlayNone"],
  ["the full image overflows the cut window (an outside band exists)", "imageOverflowsCut"],
  ["a handle still wins its own hit (no pan collision)", "handleSeparate"],
  ["OUTSIDE the cut frame, the point hits the ghost img", "outsideHitsGhost"],
  ["a pan STARTED OUTSIDE the frame translates the image", "outsidePanGrabs"],
  ["INSIDE the cut frame, the point hits the live image (not the ghost)", "insideHitsImageNotGhost"],
  ["a pan started INSIDE the frame translates the image", "insidePanGrabs"],
  ["leaving crop removes the ghost", "teardownNoGhost"],
  ["leaving crop clears .lie-cropping", "teardownNotCropping"],
];
let failed = 0;
for (const [name, key] of order) {
  const v = c[key];
  console.log(`${v ? "PASS" : "FAIL"}  ${name}`);
  if (!v) failed++;
}
console.log(`\n${order.length - failed}/${order.length} passed`);
if (failed) { console.error("\nCrop pan hit-area check FAILED — raw:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("crop pan hit-area check OK");
