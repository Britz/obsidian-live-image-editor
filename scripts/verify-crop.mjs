#!/usr/bin/env node
// Bug-32 CROP STRUCTURAL CHECK — the runnable, read-DOM-back integration check for the in-place
// crop editor rework (test-plan §3). It drives the REAL crop editor in the running vault and asserts
// the STRUCTURAL facts that the symptoms (A–H) reduce to — never assuming, always reading the live
// DOM / the real source back:
//   • no `document.body` clone overlay (true in-place);                                 (in-place)
//   • the live img placement pivots about the CENTRE (transform-origin);                (A/B/C)
//   • the white handle frame is on the inner IMG box, NOT the `.lie-frame`;             (D)
//   • 4 corner + 4 edge + 1 rotate handle exist;                                        (E)
//   • the native resize handle is hidden during crop;                                  (F)
//   • a gesture leaves the outer BOX size fixed (handles move the image, not the box);  (D)
//   • the preview transform == the committed source transform (one geometry source);   (A)
//   • NO source write while the panel is open; leaving persists ONCE = one undo step;   (auto-persist)
//   • a width edit on a crop PRESERVES transform=/aspect-ratio=;                        (G)
//   • entering crop does not move the image (no jump/reflow).                           (D8)
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build installed in examples/ and Obsidian running with
// the CDP relay. Run from the repo root:  node scripts/verify-crop.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults: host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "examples").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "examples",
};

const EVAL_RUN = `(async () => {
  window.__CROP = "";
  const R = {};
  const ok = (k, v) => { R[k] = v; };
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__CROP = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_crop-fixture.md";
    const content = [
      "# Crop fixture", "",
      "plain", "![](images/sample-landscape.png)", "",
      "first", "![](images/sample-square.png)", "",
      "second", "![](images/sample-square.png)", "",
    ].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1200));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__CROP = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const at = (n) => Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
      .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === n; } catch (e) { return false; } });
    const lineText = (n) => ed.getLine(n - 1);
    const block = (n) => (lineText(n).match(/\\{([^}]*)\\}/) || [,""])[1];
    const SINGLE = 4;
    const wrap = at(SINGLE);
    const img = wrap && wrap.querySelector("img");
    if (!img) { await vault.delete(f); window.__CROP = JSON.stringify({ fatal: "no image at line 4" }); return; }
    plugin.activeImage = img;

    // Pre-crop snapshot (reflow / no-jump): the image's own on-screen position.
    const beforeTop = Math.round(img.getBoundingClientRect().top);
    const beforeBlock = block(SINGLE);

    plugin.crop();
    await new Promise((r) => setTimeout(r, 250));
    const area = img.closest(".lie-image-area");
    const host = img.closest(".lie-wrapper, .image-embed");

    // --- Structural DOM facts ---
    ok("noBodyClone", !document.querySelector(".lie-crop-overlay") &&
       !Array.from(document.body.children).some((c) => c.className && String(c.className).includes("lie-crop")));
    ok("areaCropping", !!area && area.classList.contains("lie-cropping"));
    ok("areaOverflowVisible", !!area && getComputedStyle(area).overflow === "visible");
    ok("hostContainLifted", !!host && getComputedStyle(host).contain === "none");
    const handles = area ? area.querySelectorAll(".lie-crop-handle") : [];
    const edges = area ? area.querySelectorAll(".lie-crop-handle-n,.lie-crop-handle-s,.lie-crop-handle-e,.lie-crop-handle-w") : [];
    const rot = area ? area.querySelectorAll(".lie-crop-rotation-handle") : [];
    ok("handleCount8", handles.length === 8);
    ok("edgeHandles4", edges.length === 4);
    ok("rotateHandle1", rot.length === 1);
    const hb = area && area.querySelector(".lie-crop-handles");
    ok("handlesOnImgNotFrame", !!hb && hb.closest(".lie-crop-chrome") != null && hb.closest(".lie-frame") == null);
    ok("ghostPresent", !!(area && area.querySelector(".lie-crop-ghost-img")));
    ok("imgCentreOrigin", ["center", "center center"].includes(img.style.transformOrigin));
    const corner = host && host.querySelector(".image-resize-corner");
    ok("nativeHandleHidden", !corner || getComputedStyle(corner).display === "none");
    ok("noJumpOnEnter", Math.abs(Math.round(img.getBoundingClientRect().top) - beforeTop) <= 1);

    // --- A gesture moves the image, NOT the box; and no source write mid-session ---
    const boxBefore = area ? Math.round(area.getBoundingClientRect().width) : 0;
    const r = (area || img).getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    area.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: cx + 40, clientY: cy + 24, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    area.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
    const boxAfter = area ? Math.round(area.getBoundingClientRect().width) : 0;
    ok("boxFixedDuringGesture", boxBefore === boxAfter && boxBefore > 0);
    const previewTf = img.style.transform;
    ok("gestureMovedImage", /translate\\(/.test(previewTf) && !/translate\\(0%, 0%\\) rotate\\(0deg\\) scale\\(1\\)/.test(previewTf));
    ok("ghostTracksImg", !!(area && area.querySelector(".lie-crop-ghost-img") &&
       area.querySelector(".lie-crop-ghost-img").style.transform === previewTf &&
       area.querySelector(".lie-crop-handles").style.transform === previewTf));
    ok("noWriteWhileOpen", block(SINGLE) === beforeBlock);

    // --- Leaving persists once; preview == committed; one undo step ---
    const previewNorm = previewTf.replace(/\\s+/g, " ").trim();
    plugin.closeCrop();
    await new Promise((r) => setTimeout(r, 200));
    const committed = block(SINGLE);
    ok("persistedOnLeave", /transform=/.test(committed));
    // preview == committed: the committed source transform string equals the live preview the editor
    // showed at gesture-end (one geometry source — the editor applies toCropResult().transform).
    const srcTf = ((committed.match(/transform=\\"([^\\"]*)\\"/) || [,""])[1]).replace(/\\s+/g, " ").trim();
    ok("previewEqualsCommitted", srcTf !== "" && srcTf === previewNorm);
    // one undo step: a SINGLE undo (the Obsidian Editor API — no focus needed) returns the line to
    // its pre-crop (blank) block. The whole session wrote exactly once (noWriteWhileOpen +
    // persistedOnLeave), funnelled through the shared isolateHistory.of("full") writer.
    ed.undo();
    await new Promise((r) => setTimeout(r, 150));
    ok("oneUndoStep", block(SINGLE) === beforeBlock);

    // --- G: a width edit preserves the crop (drive the real LP resize write path on #2-style data) ---
    // Re-crop the SINGLE image, then run a width edit and confirm transform=/aspect-ratio= survive.
    plugin.activeImage = img;
    plugin.modifyTransform((t) => { t.transform = "translate(-10%, -5%) scale(1.3)"; t.aspectRatio = "4/3"; t.width = "240px"; });
    await new Promise((r) => setTimeout(r, 120));
    plugin.modifyTransform((t) => { t.width = "300px"; });
    await new Promise((r) => setTimeout(r, 120));
    const afterWidth = block(SINGLE);
    ok("widthEditKeepsCrop", /transform=/.test(afterWidth) && /aspect-ratio=4\\/3/.test(afterWidth) && /width=300/.test(afterWidth));

    await vault.delete(f);
    window.__CROP = JSON.stringify({ checks: R });
  } catch (e) { window.__CROP = JSON.stringify({ fatal: String(e && e.stack || e) }); }
})()`;

const EVAL_READ = `window.__CROP || ""`;

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
  throw new Error("timed out waiting for window.__CROP (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }
const c = res.checks ?? {};
const order = [
  ["in-place: no document.body clone overlay", "noBodyClone"],
  ["area carries .lie-cropping", "areaCropping"],
  ["area overflow lifted to visible", "areaOverflowVisible"],
  ["host contain:paint lifted", "hostContainLifted"],
  ["8 handles (4 corner + 4 edge)", "handleCount8"],
  ["4 edge handles (D8 single-axis)", "edgeHandles4"],
  ["1 rotate knob", "rotateHandle1"],
  ["handles on the inner img box, NOT the .lie-frame (D)", "handlesOnImgNotFrame"],
  ["dim ghost present (outside dimmed)", "ghostPresent"],
  ["live img transform-origin: center (A)", "imgCentreOrigin"],
  ["native resize handle hidden in crop (F)", "nativeHandleHidden"],
  ["no jump on enter (image stays put)", "noJumpOnEnter"],
  ["a gesture leaves the box size fixed (D)", "boxFixedDuringGesture"],
  ["the gesture moved the image (preview live)", "gestureMovedImage"],
  ["ghost + handles track the img transform", "ghostTracksImg"],
  ["NO source write while the panel is open", "noWriteWhileOpen"],
  ["leaving the panel persisted once (transform=)", "persistedOnLeave"],
  ["preview transform == committed source", "previewEqualsCommitted"],
  ["one undo step for the whole session", "oneUndoStep"],
  ["a width edit preserves the crop (G)", "widthEditKeepsCrop"],
];
let failed = 0;
for (const [name, key] of order) {
  const v = c[key];
  console.log(`${v ? "PASS" : "FAIL"}  ${name}`);
  if (!v) failed++;
}
console.log(`\n${order.length - failed}/${order.length} passed`);
if (failed) { console.error("\nCrop structural check FAILED — raw:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("crop structural check OK");
