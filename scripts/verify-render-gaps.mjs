#!/usr/bin/env node
// CLEAN-ROOM RENDER-GAP CHECK — two structural, read-back integration checks:
//
//  F2  (reading-view duplicate resolution): a file embedded twice with DIFFERENT transforms must
//      render each occurrence with ITS OWN transform. The reconcile path (reconcileFromSource)
//      previously resolved every duplicate to the FIRST basename match, so the 2nd embed showed
//      the 1st's transform. This forces a reconcile and reads the live `.lie-frame` orientation of
//      each occurrence back — with the bug, occurrence 1 would carry occurrence 0's rotate.
//
//  F24 (icon → inline): the size sub-menu's "icon" preset must couple to the INLINE rendering
//      (F17), not merely set a height. Drives the real customSize panel, clicks the icon preset,
//      leaves to persist, and reads the source `{…}` back — it must carry `.lie-inline`.
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build in examples/ + Obsidian with the CDP relay.
//   node scripts/verify-render-gaps.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "examples").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "examples",
};

const EVAL_RUN = `(async () => {
  window.__RG = "";
  const R = {};
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__RG = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ---- F2: a duplicated landscape with DISTINCT transforms, rendered in READING view ----
    const P2 = "_rg-f2.md";
    const c2 = [
      "# F2 duplicate", "",
      "![](images/sample-landscape.png){rotate=90}", "",
      "![](images/sample-landscape.png){flip=horizontal}", "",
    ].join("\\n");
    let f2 = vault.getAbstractFileByPath(P2);
    if (f2) await vault.modify(f2, c2); else f2 = await vault.create(P2, c2);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(f2);
    await leaf.setViewState({ type: "markdown", state: { file: f2.path, mode: "preview" } });
    await sleep(1200);
    const pv = document.querySelector(".markdown-preview-view, .markdown-reading-view");
    const frameTransforms = () => Array.from((pv || document).querySelectorAll(".lie-image-area .lie-frame"))
      .map((fr) => fr.style.transform || "");
    R.f2_rendered = !!pv && pv.querySelectorAll("img").length >= 2;
    R.f2_before = frameTransforms();
    plugin.reconcileFromSource();           // the path that carried the F2 bug
    await sleep(400);
    R.f2_after = frameTransforms();
    await vault.delete(f2);

    // ---- F24: icon preset → the source carries .lie-inline ----
    const P24 = "_rg-f24.md";
    const c24 = ["# F24 icon", "", "![](images/sample-square.png)", ""].join("\\n");
    let f24 = vault.getAbstractFileByPath(P24);
    if (f24) await vault.modify(f24, c24); else f24 = await vault.create(P24, c24);
    const leaf2 = app.workspace.getLeaf(false);
    await leaf2.openFile(f24);
    await leaf2.setViewState({ type: "markdown", state: { file: f24.path, mode: "source", source: false } });
    await sleep(1000);
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    ed.setCursor({ line: 0, ch: 0 });
    const wrap = document.querySelector(".lie-wrapper-standalone, .lie-wrapper-block");
    const img = wrap && wrap.querySelector("img");
    if (!img) { R.f24_error = "no LP image"; }
    else {
      plugin.activeImage = img;
      plugin.customSize();                  // open the real size panel
      await sleep(400);
      const choices = Array.from(document.querySelectorAll(".lie-size-choice"));
      R.f24_choiceCount = choices.length;   // order: original, ICON, small, medium, large
      const iconBtn = choices[1];
      if (!iconBtn) { R.f24_error = "no icon button"; }
      else {
        iconBtn.click();                    // pick "icon"
        await sleep(250);
        plugin.closeSubmenu(true);          // leave → persist (auto-persist)
        await sleep(400);
        R.f24_line = ed.getLine(2);
      }
    }
    await vault.delete(f24);

    window.__RG = JSON.stringify(R);
  } catch (e) { window.__RG = JSON.stringify({ fatal: String(e) }); }
})()`;

const EVAL_READ = `window.__RG || ""`;

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
  throw new Error("timed out waiting for window.__RG");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }

const has = (s, sub) => typeof s === "string" && s.includes(sub);
const checks = [];

// F2 — only meaningful if reading view actually rendered (focused window). If not, report it.
if (!res.f2_rendered) {
  console.log("SKIP  F2 reading-view check — reading view did not render (window backgrounded?)");
} else {
  const after = res.f2_after ?? [];
  checks.push(["F2: occurrence 0 keeps rotate after reconcile", has(after[0], "rotate(90deg)")]);
  checks.push(["F2: occurrence 1 keeps flip (scaleX(-1)) after reconcile", has(after[1], "scaleX(-1)")]);
  checks.push(["F2: occurrence 1 is NOT clobbered with occurrence 0's rotate", !has(after[1], "rotate(90deg)")]);
}

// F24 — the persisted block must carry the inline class.
checks.push(["F24: icon preset persists .lie-inline", has(res.f24_line, ".lie-inline")]);

let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed) { console.error("\nrender-gaps FAILED — details:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("render-gaps OK");
