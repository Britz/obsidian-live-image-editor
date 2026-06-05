#!/usr/bin/env node
// SUBMODAL ↔ TOOLBAR = ONE ACTIVE REGION — the runnable, read-DOM-back structural check for the
// combined hover/active region (D6/F14; test-plan §3, T-L6 — the obsidian/CM-coupled half, not a
// vitest unit). It opens the REAL size sub-menu over an image and drives the region's hover state
// machine with synthetic enter/leave on each member — the exact events the host's listeners
// consume — asserting that the toolbar (greyed) and the panel form ONE region:
//   • on open both are shown and the toolbar carries `.lie-region-active`;
//   • moving image→panel across the GAP keeps the region active (the grace delay bridges it);
//   • arriving on the PANEL keeps the toolbar+panel up (interacting with the modal stays "inside");
//   • leaving the WHOLE region hides BOTH together (panel display:none + region-active dropped);
//   • re-entering via the TOOLBAR or the IMAGE brings both back together.
// The real-pointer `:hover` CSS path (Input.dispatchMouseEvent across coordinates) is a manual
// check; the STRUCTURAL region state (which the flicker bug reduces to — the `.lie-region-active`
// toggle + the panel visibility moving in lockstep) is asserted here against the live DOM.
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build installed in examples/ and Obsidian running with
// the CDP relay. Run from the repo root:  node scripts/verify-submodal-region.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults: host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "examples").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "examples",
};

const EVAL_RUN = `(async () => {
  window.__SUBREGION = "";
  const R = {};
  const ok = (k, v) => { R[k] = v; };
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__SUBREGION = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_submodal-region-fixture.md";
    const content = [
      "# Submodal region fixture", "",
      "plain", "![](images/sample-landscape.png)", "",
    ].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1200));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__SUBREGION = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const LINE = 4;
    const wrapAt = () => Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
      .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === LINE; } catch (e) { return false; } });
    const img = wrapAt() && wrapAt().querySelector("img");
    if (!img) { await vault.delete(f); window.__SUBREGION = JSON.stringify({ fatal: "no image at line 4" }); return; }

    // Open the size sub-menu over the image (in-chrome OR floating toolbar — selected by the greyed
    // marker, so this is toolbar-type-agnostic).
    plugin.activeImage = img;
    plugin.customSize();
    await sleep(280);
    const region = img.closest(".lie-wrapper");                 // the hoverRegion member
    const panel = document.querySelector(".lie-submenu");       // the panel member
    const toolbar = document.querySelector(".lie-toolbar-inactive"); // the toolbar member (greyed while open)
    if (!region || !panel || !toolbar) {
      plugin.closeSubmenu(); await vault.delete(f);
      window.__SUBREGION = JSON.stringify({ fatal: "missing region/panel/toolbar el" }); return;
    }
    const active = () => toolbar.classList.contains("lie-region-active");
    const panelShown = () => panel.style.display !== "none";
    const fire = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: false }));

    // (0) On open: both shown, toolbar greyed + part of the region.
    ok("greyedWhileOpen", toolbar.classList.contains("lie-toolbar-inactive"));
    ok("initBothShown", active() && panelShown());
    // The greyed bar must be a REAL hover surface while active (pointer-events:auto) — else a real
    // pointer moving onto it (esp. the floating bar, outside the image rect) drops the region. The
    // synthetic enter/leave below can't catch a pointer-events:none regression, so assert it here;
    // its BUTTONS must stay inert (D6 inactive).
    ok("barHoverableWhileActive", getComputedStyle(toolbar).pointerEvents !== "none");
    const aBtn = toolbar.querySelector(".lie-toolbar-btn");
    ok("barButtonsInertWhileActive", !aBtn || getComputedStyle(aBtn).pointerEvents === "none");

    // (1) Travel image→panel across the GAP: leaving the image must NOT drop the region while the
    //     pointer is mid-travel (the grace delay), and arriving on the panel keeps it up.
    fire(region, "mouseleave");
    ok("graceKeepsDuringTravel", active());                     // synchronous: grace timer running, not yet dropped
    fire(panel, "mouseenter");
    await sleep(240);                                           // past the 160ms grace
    ok("panelKeepsRegion", active() && panelShown());          // ON the modal keeps toolbar + panel

    // (2) Leave the WHOLE region (off the panel, nothing else entered): both hide TOGETHER.
    fire(panel, "mouseleave");
    await sleep(260);                                           // grace elapses
    ok("bothHideOnLeave", !active() && !panelShown());

    // (3) Re-enter via the TOOLBAR (the "unterwegs / on the bar" case): both come back together.
    fire(toolbar, "mouseenter");
    await sleep(60);
    ok("toolbarReEntersRegion", active() && panelShown());

    // (4) Leave via the toolbar, then re-enter via the IMAGE: still one region, both together.
    fire(toolbar, "mouseleave");
    await sleep(260);
    ok("bothHideAfterToolbar", !active() && !panelShown());
    fire(region, "mouseenter");
    await sleep(60);
    ok("imageReEntersRegion", active() && panelShown());

    plugin.closeSubmenu();
    await sleep(150);
    await vault.delete(f);
    window.__SUBREGION = JSON.stringify({ checks: R });
  } catch (e) { window.__SUBREGION = JSON.stringify({ fatal: String(e && e.stack || e) }); }
})()`;

const EVAL_READ = `window.__SUBREGION || ""`;

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
  throw new Error("timed out waiting for window.__SUBREGION (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }
const c = res.checks ?? {};
const order = [
  ["toolbar is greyed while the submenu is open", "greyedWhileOpen"],
  ["on open: toolbar + panel both shown (one region)", "initBothShown"],
  ["greyed bar is a real hover surface (pointer-events:auto)", "barHoverableWhileActive"],
  ["greyed bar's buttons stay inert (D6 inactive)", "barButtonsInertWhileActive"],
  ["image→panel travel keeps the region (grace bridges the gap)", "graceKeepsDuringTravel"],
  ["arriving on the panel keeps toolbar + panel up", "panelKeepsRegion"],
  ["leaving the whole region hides BOTH together", "bothHideOnLeave"],
  ["re-entering via the toolbar brings both back", "toolbarReEntersRegion"],
  ["leaving via the toolbar hides both together", "bothHideAfterToolbar"],
  ["re-entering via the image brings both back", "imageReEntersRegion"],
];
let failed = 0;
for (const [name, key] of order) {
  const v = c[key];
  console.log(`${v ? "PASS" : "FAIL"}  ${name}`);
  if (!v) failed++;
}
console.log(`\n${order.length - failed}/${order.length} passed`);
if (failed) { console.error("\nSubmodal region check FAILED — raw:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("submodal active-region check OK");
