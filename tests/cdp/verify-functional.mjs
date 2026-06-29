#!/usr/bin/env node
// FUNCTIONAL — area D of the suite (test-plan §4): instead of only OBSERVING a pre-set state, this
// DRIVES the UI like a user (types into the size modal's fields, clicks commit) and then verifies BOTH
// the visible result (the rendered image width) AND the persisted source `{…}`. Run against a DEV
// build in vault-image-toolbar/ with Obsidian + the CDP relay:
//   node tests/cdp/verify-functional.mjs        (CDP_PORT defaults to 9223, target vault-image-toolbar)
//
// Checks (size modal — F24/D6.1/AD1):
//   • type a width      → the image re-renders at that width AND the source persists `width=250`
//   • type width+height → the source persists BOTH (the explicit custom-size path, T2.3)
//   • clear the fields  → the size is removed (source has no width/height) and the image widens back

import { connectOptical } from "./_optical.mjs";

const FIXTURE = "_functional-fixture.md";

// Locate the line-3 image + editor; shared prelude for every op eval.
const PRELUDE = `
  const plugin = app.plugins.plugins["live-image-editor"];
  const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
  const cm = ed && ed.cm;
  // re-locate every time: a commit re-renders the line, replacing the old img node (stale = width 0).
  const locate = () => { try { return Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block,.lie-wrapper"))
    .find((w) => cm.state.doc.lineAt(cm.posAtDOM(w)).number === 3)?.querySelector("img") || null; } catch (e) { return null; } };
  const img = locate();
  if (!img) return { fatal: "no image at line 3" };
  plugin.activeImage = img;`;

const SETUP = `(async () => {
  const plugin = app.plugins.plugins["live-image-editor"];
  if (!plugin) return { fatal: "plugin not loaded" };
  const vault = app.vault;
  const L = ["# functional fixture", "", "![](images/sample-landscape.png){width=300}", "", "tail", ""].join("\\n");
  let f = vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
  if (f) await vault.modify(f, L); else f = await vault.create(${JSON.stringify(FIXTURE)}, L);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise(r => setTimeout(r, 1500));
  const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
  if (!ed || !ed.cm) return { fatal: "no editor/cm (open in Live Preview)" };
  return { ok: true };
})()`;

// Open the size modal, run `setFields` against the two .lie-size-input fields ([0]=width,[1]=height),
// read the LIVE-preview width, commit (persist), then read the rendered width + the source line back.
const sizeOp = (setFields) => `(async () => {${PRELUDE}
  if (plugin.submenu) plugin.closeSubmenu(false);
  plugin.customSize();
  await new Promise(r => setTimeout(r, 300));
  const body = document.querySelector(".lie-submenu .lie-size-body");
  if (!body) return { fatal: "size modal did not open" };
  const inputs = body.querySelectorAll(".lie-size-input");
  const set = (i, v) => { inputs[i].value = v; inputs[i].dispatchEvent(new Event("input", { bubbles: true })); };
  ${setFields}
  await new Promise(r => setTimeout(r, 250));
  // live render of the typed value (the preview re-renders the same img on each field input)
  const liveW = Math.round(img.getBoundingClientRect().width);
  plugin.closeSubmenu(true); // accept / persist (auto-persist, F14)
  await new Promise(r => setTimeout(r, 300));
  const src = ed.getLine(2); // line 3 (0-indexed)
  const block = (src.match(/\\{([^}]*)\\}/) || [, ""])[1];
  return { ok: true, liveW, block };
})()`;

async function main() {
  const cdp = await connectOptical();
  let setupDone = false;
  try {
    const s = await cdp.evaluate(SETUP);
    setupDone = true;
    if (!s || s.fatal || !s.ok) throw new Error("setup: " + JSON.stringify(s));
    await cdp.hover(2, 2); // neutral pointer

    const width = await cdp.evaluate(sizeOp(`set(0, "250");`));
    if (width.fatal) throw new Error("width op: " + width.fatal);
    const both = await cdp.evaluate(sizeOp(`set(0, "220"); set(1, "180");`));
    if (both.fatal) throw new Error("both op: " + both.fatal);
    const cleared = await cdp.evaluate(sizeOp(`set(0, ""); set(1, "");`));
    if (cleared.fatal) throw new Error("clear op: " + cleared.fatal);

    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    const checks = [
      // typing a width: the live preview re-renders to ~250, and the source persists width=250
      ["size modal: typing a width re-renders the image to it, live (F24)", near(width.liveW, 250, 6)],
      ["size modal: the typed width persists to the source (AD1)", /(^|\s)width=250(\s|$)/.test(width.block)],
      // typing width+height: live render ~220 + both persist (the explicit custom-size path, T2.3/D6.1)
      ["size modal: width+height render to ~220 wide, live (F24)", near(both.liveW, 220, 6)],
      ["size modal: width+height both persist (T2.3/D6.1)", /(^|\s)width=220(\s|$)/.test(both.block) && /(^|\s)height=180(\s|$)/.test(both.block)],
      // clearing the fields: image widens back toward the column + size removed from source
      ["size modal: clearing the fields widens the image back, live (Bug 42)", cleared.liveW > 320],
      ["size modal: clearing removes the size from the source (Bug 42)", !/width=/.test(cleared.block) && !/height=/.test(cleared.block)],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    console.log("  raw:", JSON.stringify({ width, both, cleared }));
    if (failed) { console.error("\nFunctional (size modal) FAILED"); process.exitCode = 1; }
    else console.log("functional (size modal) OK");
  } finally {
    if (setupDone) {
      await cdp.evaluate(`(async () => {
        try { const p = app.plugins.plugins["live-image-editor"]; if (p && p.submenu) p.closeSubmenu(false); } catch (e) {}
        try { const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}); if (f) await app.vault.delete(f); } catch (e) {}
      })()`).catch(() => {});
    }
    cdp.close();
  }
}

main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(2); });
