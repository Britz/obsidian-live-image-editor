#!/usr/bin/env node
// CLICK-AWAY CLOSES THE SUB-PANEL — crop EXEMPT (Bug 54; D6/F14/AD8; test-plan §3, Lesson 6 — the
// obsidian/CM-coupled half, not a vitest unit; the pure decision is tests/toolbar-region-logic.test.ts).
// It drives the REAL panels in the running vault and asserts, by reading the live DOM and the SOURCE
// back, that an ACTIVE click OUTSIDE the active region:
//   • with a FILTER panel open → closes it and PERSISTS once (auto-persist — the filter lands in {…});
//   • with a SIZE panel open   → closes it and PERSISTS once (width lands in {…});
//   • with the CROP editor open → does NOTHING: `.lie-cropping` + the crop controls stay, and the
//     source is byte-unchanged (a stray click must never tear down the in-place session — crop ends
//     only via its own toggle / ✓ / ✗ / Esc).
// The click is a synthetic `click` dispatched on a non-image editor line (bubbles to the document
// delegate) — the exact event the delegate consumes. (The real-pointer `:hover` travel path is a
// manual focused-window check; see issues.md → Verifications.)
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build installed in example-vault/ and Obsidian running with
// the CDP relay. Run from the repo root:  node tests/cdp/verify-region-clickaway.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults: host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "example-vault").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "example-vault",
};

const EVAL_RUN = `(async () => {
  window.__CLICKAWAY = "";
  const R = {};
  const ok = (k, v) => { R[k] = v; };
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__CLICKAWAY = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    // Reset any panel/crop left open by a prior partial run, so consecutive runs start clean.
    try { plugin.closeFilterPanel(false); } catch (e) { /* none open */ }
    try { plugin.closeSubmenu(false); } catch (e) { /* none open */ }
    try { plugin.closeCrop(false); } catch (e) { /* none open */ }
    const vault = app.vault;
    const PATH = "_clickaway-fixture.md";
    const content = [
      "# Click-away fixture", "",
      "plain", "![](images/sample-landscape.png)", "",
    ].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1200));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__CLICKAWAY = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const LINE = 4;
    const lineText = () => ed.getLine(LINE - 1);
    const block = () => { const m = lineText().match(/\\{([^}]*)\\}/); return m ? m[1] : ""; };
    const freshImg = () => {
      const w = Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
        .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === LINE; } catch (e) { return false; } });
      return w && w.querySelector("img");
    };
    // A genuine OUTSIDE-the-region click target: the first editor line (the heading), which is not
    // inside any .lie-wrapper / panel / palette / crop chrome.
    const clickAway = () => {
      const line = document.querySelector(".cm-content .cm-line") || cm.contentDOM;
      line.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    };
    // Clicking the IMAGE itself is the reported case: the image fills most of the canvas, so a user
    // dismissing a panel usually clicks the image — which is OUTSIDE the sub-panel and must close+
    // persist filter/size (but NEVER end crop). The image is part of the hover region, so this only
    // works because the click-away boundary is the sub-panel, not the whole region.
    const clickImage = () => {
      const im = freshImg();
      im && im.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    };

    if (!freshImg()) { await vault.delete(f); window.__CLICKAWAY = JSON.stringify({ fatal: "no image at line 4" }); return; }

    // --- FILTER: click-away closes + persists ONCE ---
    plugin.activeImage = freshImg();
    plugin.toggleFilters();
    await sleep(250);
    ok("filterOpened", !!plugin.filterPanel && !!document.querySelector(".lie-filter-panel"));
    const fBase = block();
    const slider = document.querySelector('.lie-filter-panel .lie-filter-slider-input[data-key="brightness"]');
    if (slider) { slider.value = "1.5"; slider.dispatchEvent(new Event("input", { bubbles: true })); }
    await sleep(80);
    ok("filterNoWriteWhileOpen", block() === fBase);                 // live preview only
    clickAway();
    await sleep(300);
    ok("filterClosedOnClickAway", !plugin.filterPanel && !document.querySelector(".lie-filter-panel"));
    ok("filterPersistedOnClickAway", block().indexOf("filter=") >= 0);
    ed.undo();                                                        // one undo step reverts the session
    await sleep(180);
    ok("filterOneUndoStep", block() === fBase);

    // --- SIZE: click-away closes + persists ONCE ---
    plugin.activeImage = freshImg();
    plugin.customSize();
    await sleep(250);
    ok("sizeOpened", !!plugin.submenu && !!document.querySelector(".lie-submenu"));
    const sBase = block();
    const sizeInp = document.querySelector(".lie-submenu .lie-size-input");
    if (sizeInp) { sizeInp.value = "321"; sizeInp.dispatchEvent(new Event("input", { bubbles: true })); }
    await sleep(80);
    clickAway();
    await sleep(300);
    ok("sizeClosedOnClickAway", !plugin.submenu && !document.querySelector(".lie-submenu"));
    ok("sizePersistedOnClickAway", block().indexOf("width=321") >= 0);
    ed.undo();
    await sleep(180);
    ok("sizeOneUndoStep", block() === sBase);

    // --- CROP: click-away does NOTHING (session protected, no write) ---
    plugin.activeImage = freshImg();
    plugin.crop();
    await sleep(300);
    const cropOpened = !!plugin.cropEditor && !!document.querySelector(".lie-cropping") && !!document.querySelector(".lie-submenu");
    ok("cropOpened", cropOpened);
    const srcBefore = ed.getValue();
    clickAway();
    await sleep(300);
    ok("cropStaysOnClickAway", !!plugin.cropEditor && !!document.querySelector(".lie-cropping") && !!document.querySelector(".lie-submenu"));
    ok("cropNoWriteOnClickAway", ed.getValue() === srcBefore);
    plugin.closeCrop(false);                                         // silent teardown — no write
    await sleep(200);

    // --- THE REPORTED CASE: clicking the IMAGE (which fills most of the canvas) closes + persists the
    //     panel. The image is part of the hover region, so this only works because the click-away
    //     boundary is the SUB-PANEL, not the whole region. Proven here for FILTER; SIZE shares the same
    //     pure decision (clickDismissesToolbar with panelOpen) and CROP's exemption is independent of
    //     the click target (cropActive short-circuits) — both covered by the unit test and the empty-
    //     space crop section above. One section keeps this guard reliable under window throttling. ---
    plugin.activeImage = freshImg();
    plugin.toggleFilters();
    await sleep(250);
    const sl2 = document.querySelector('.lie-filter-panel .lie-filter-slider-input[data-key="brightness"]');
    if (sl2) { sl2.value = "1.4"; sl2.dispatchEvent(new Event("input", { bubbles: true })); }
    await sleep(80);
    clickImage();
    await sleep(300);
    ok("filterClosedOnImageClick", !plugin.filterPanel && !document.querySelector(".lie-filter-panel"));
    ok("filterPersistedOnImageClick", block().indexOf("filter=") >= 0);
    ed.undo(); await sleep(150);

    await vault.delete(f);
    window.__CLICKAWAY = JSON.stringify({ checks: R });
  } catch (e) { window.__CLICKAWAY = JSON.stringify({ fatal: String(e && e.stack || e) }); }
})()`;

const EVAL_READ = `window.__CLICKAWAY || ""`;

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
  // A backgrounded Obsidian window clamps each setTimeout to ~1s, so the multi-panel eval can take
  // ~20s; poll long enough to cover that. (For a reliable run, give the window focus — these CDP
  // checks are focused-window guards, like the rest of tests/cdp.)
  for (let i = 0; i < 35; i++) {
    sleep(1000);
    const out = execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_READ], { env, encoding: "utf8" });
    const res = parseResult(out);
    if (res) return res;
  }
  throw new Error("timed out waiting for window.__CLICKAWAY (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }
const c = res.checks ?? {};
const order = [
  ["filter panel opened", "filterOpened"],
  ["no source write while the filter panel is open", "filterNoWriteWhileOpen"],
  ["click-away CLOSES the filter panel", "filterClosedOnClickAway"],
  ["click-away PERSISTS the filter (filter= in {…})", "filterPersistedOnClickAway"],
  ["filter click-away = one undo step", "filterOneUndoStep"],
  ["size panel opened", "sizeOpened"],
  ["click-away CLOSES the size panel", "sizeClosedOnClickAway"],
  ["click-away PERSISTS the size (width=321 in {…})", "sizePersistedOnClickAway"],
  ["size click-away = one undo step", "sizeOneUndoStep"],
  ["crop editor opened (.lie-cropping + controls)", "cropOpened"],
  ["click-away leaves CROP OPEN (.lie-cropping + controls stay)", "cropStaysOnClickAway"],
  ["click-away writes NOTHING while cropping", "cropNoWriteOnClickAway"],
  ["clicking the IMAGE closes the filter panel (boundary = sub-panel, not region)", "filterClosedOnImageClick"],
  ["clicking the IMAGE PERSISTS the filter (the reported bug)", "filterPersistedOnImageClick"],
];
let failed = 0;
for (const [name, key] of order) {
  const v = c[key];
  console.log(`${v ? "PASS" : "FAIL"}  ${name}`);
  if (!v) failed++;
}
console.log(`\n${order.length - failed}/${order.length} passed`);
if (failed) { console.error("\nClick-away region check FAILED — raw:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("click-away region check OK (filter/size close+persist, crop exempt)");
