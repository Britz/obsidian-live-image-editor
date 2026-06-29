#!/usr/bin/env node
// SUBMODAL ACCEPT/CANCEL ICONS — the runnable, read-DOM / read-source-back structural check for the
// restored accept (✓) + cancel (✗) icons on the shared host (F14/AD8/D6; test-plan §3, Lesson 6 — the
// obsidian/CM-coupled half of the rework, not a vitest unit). It drives the REAL size sub-menu in
// the running vault and asserts, by reading the live DOM and the SOURCE back, that:
//   • the header carries reset · cancel (✗) · accept (✓) icon buttons, each with an svg;
//   • NO source write happens while the panel is open (live preview only);
//   • ✓ ACCEPT persists + closes — the edit lands in the `{…}` (= the leave/dismiss result), one
//     undo step reverts the whole session;
//   • ✗ CANCEL discards + closes — NO source write AND the live DOM is restored to the pre-open
//     state (re-rendered from the unchanged source);
//   • LEAVING (dismiss) still persists — auto-persist is UNCHANGED by the rework.
// The pure crux (exit-reason routing, `submenuExitEffect`) is pinned in tests/anchored-submenu-
// logic.test.ts; this is the integration half.
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build installed in vault-image-toolbar/ and Obsidian running with
// the CDP relay. Run from the repo root:  node tests/cdp/verify-submodal-icons.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults: host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "vault-image-toolbar").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "vault-image-toolbar",
};

const EVAL_RUN = `(async () => {
  window.__SUBICONS = "";
  const R = {};
  const ok = (k, v) => { R[k] = v; };
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__SUBICONS = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_submodal-icons-fixture.md";
    const content = [
      "# Submodal icons fixture", "",
      "plain", "![](images/sample-landscape.png)", "",
    ].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1200));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__SUBICONS = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const LINE = 4;
    const lineText = () => ed.getLine(LINE - 1);
    const block = () => { const m = lineText().match(/\\{([^}]*)\\}/); return m ? m[1] : ""; };
    // Re-acquire the live img each phase — a source write rebuilds the LP widget (new img node).
    const freshImg = () => {
      const w = Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
        .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === LINE; } catch (e) { return false; } });
      return w && w.querySelector("img");
    };
    const boxWidth = () => { const i = freshImg(); const a = i && i.closest(".lie-image-area"); return a ? a.style.width : ""; };
    const setWidth = (px) => {
      const inp = document.querySelector(".lie-submenu .lie-size-input");
      if (!inp) throw new Error("no size input in the open submenu");
      inp.value = String(px);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    };

    if (!freshImg()) { await vault.delete(f); window.__SUBICONS = JSON.stringify({ fatal: "no image at line 4" }); return; }

    // --- The header carries reset · cancel (✗) · accept (✓), each an icon button with an svg ---
    plugin.activeImage = freshImg();
    plugin.customSize();
    await sleep(250);
    const actions = document.querySelector(".lie-submenu .lie-submenu-actions");
    const resetBtn = actions && actions.querySelector(".lie-submenu-reset");
    const cancelBtn = actions && actions.querySelector(".lie-submenu-cancel");
    const acceptBtn = actions && actions.querySelector(".lie-submenu-confirm");
    ok("hasReset", !!resetBtn);
    ok("hasCancel", !!cancelBtn);
    ok("hasAccept", !!acceptBtn);
    ok("cancelHasIcon", !!(cancelBtn && cancelBtn.querySelector("svg")));
    ok("acceptHasIcon", !!(acceptBtn && acceptBtn.querySelector("svg")));
    ok("cancelLabelled", !!(cancelBtn && cancelBtn.getAttribute("aria-label")));
    ok("acceptLabelled", !!(acceptBtn && acceptBtn.getAttribute("aria-label")));

    // --- ✓ ACCEPT = persist + close (one write; identical to leaving) ---
    const baseBlock = block();
    setWidth(333);
    await sleep(80);
    ok("noWriteWhileOpenAccept", block() === baseBlock);            // live preview only — no source write
    document.querySelector(".lie-submenu .lie-submenu-confirm").click();
    await sleep(280);
    ok("acceptClosed", !document.querySelector(".lie-submenu") && !plugin.submenu);
    ok("acceptPersisted", block().indexOf("width=333") >= 0);
    ed.undo();
    await sleep(180);
    ok("acceptOneUndoStep", block() === baseBlock);                 // the whole session = one undo step

    // --- ✗ CANCEL = discard + close (no write; live DOM restored to pre-open) ---
    plugin.activeImage = freshImg();
    plugin.customSize();
    await sleep(220);
    const preCancelBlock = block();
    setWidth(444);
    await sleep(80);
    ok("cancelPreviewApplied", boxWidth() === "444px");            // the live preview DID change
    document.querySelector(".lie-submenu .lie-submenu-cancel").click();
    await sleep(280);
    ok("cancelClosed", !document.querySelector(".lie-submenu") && !plugin.submenu);
    ok("cancelNoWrite", block() === preCancelBlock && block().indexOf("width=444") < 0);
    ok("cancelDomRestored", boxWidth() !== "444px");               // re-rendered from the unchanged source

    // --- LEAVE (dismiss) still persists — auto-persist UNCHANGED ---
    plugin.activeImage = freshImg();
    plugin.customSize();
    await sleep(220);
    setWidth(222);
    await sleep(80);
    plugin.closeSubmenu();                                          // the click-away / dismiss leave path → commit
    await sleep(280);
    ok("leavePersists", block().indexOf("width=222") >= 0);
    ed.undo();
    await sleep(180);

    await vault.delete(f);
    window.__SUBICONS = JSON.stringify({ checks: R });
  } catch (e) { window.__SUBICONS = JSON.stringify({ fatal: String(e && e.stack || e) }); }
})()`;

const EVAL_READ = `window.__SUBICONS || ""`;

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
  throw new Error("timed out waiting for window.__SUBICONS (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }
const c = res.checks ?? {};
const order = [
  ["header has a reset icon", "hasReset"],
  ["header has a cancel (✗) icon", "hasCancel"],
  ["header has an accept (✓) icon", "hasAccept"],
  ["cancel button renders an svg", "cancelHasIcon"],
  ["accept button renders an svg", "acceptHasIcon"],
  ["cancel button is labelled (aria)", "cancelLabelled"],
  ["accept button is labelled (aria)", "acceptLabelled"],
  ["NO source write while open (accept path)", "noWriteWhileOpenAccept"],
  ["✓ accept closes the panel", "acceptClosed"],
  ["✓ accept persists the edit (width=333 in {…})", "acceptPersisted"],
  ["✓ accept = one undo step for the session", "acceptOneUndoStep"],
  ["✗ cancel's live preview was applied first", "cancelPreviewApplied"],
  ["✗ cancel closes the panel", "cancelClosed"],
  ["✗ cancel writes NOTHING to source", "cancelNoWrite"],
  ["✗ cancel restores the live DOM (pre-open)", "cancelDomRestored"],
  ["leaving/dismiss still persists (auto-persist)", "leavePersists"],
];
let failed = 0;
for (const [name, key] of order) {
  const v = c[key];
  console.log(`${v ? "PASS" : "FAIL"}  ${name}`);
  if (!v) failed++;
}
console.log(`\n${order.length - failed}/${order.length} passed`);
if (failed) { console.error("\nSubmodal accept/cancel check FAILED — raw:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("submodal accept/cancel icons check OK");
