#!/usr/bin/env node
// SUBMODAL ↔ TOOLBAR = ONE ACTIVE REGION — the runnable, read-DOM-back structural check for the
// combined hover/active region (D6/F14; test-plan §3). It opens the REAL filter panel beside an image
// and drives the region's hover state machine with a **real CDP pointer** (Input.dispatchMouseEvent
// via _optical.mjs), asserting that the toolbar (greyed) and the panel form ONE region:
//   • on open both are shown and the toolbar is greyed (.lie-toolbar-inactive, opacity 0.4), a real
//     hover surface (pointer-events:auto) whose BUTTONS stay inert;
//   • travelling image→gap→panel keeps the region active (the grace bridges the gap, the panel catches);
//   • while active, the greyed toolbar is a region member (panel→toolbar keeps it up);
//   • moving the pointer right OUT of the region hides BOTH together (panel display:none + inactive);
//   • re-entering via the IMAGE brings both back together.
//
// WHY a real pointer (not synthetic MouseEvents): the region binder reacts to the real :hover /
// pointer-events path; a synthetic `new MouseEvent("mouseleave")` doesn't move the real hover, so it
// would both FALSE-RED the leave checks AND FALSE-GREEN the "still active" ones (the region never
// actually moved). The real pointer makes every transition honest. (A test that can't drive what it
// asserts is as useless as one that's always green.)
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build in example-vault/ + Obsidian with the CDP relay.
//   node tests/cdp/verify-submodal-region.mjs   (CDP_PORT defaults 9223, target example-vault)

import { connectOptical } from "./_optical.mjs";

const FIXTURE = "_submodal-region-fixture.md";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Region state, read from the live DOM via the stashed element refs.
const STATE = `(() => {
  const t = window.__srToolbar, p = window.__srPanel;
  if (!t || !p) return { gone: true };
  // panel visibility is COMPUTED (the hide is via CSS keyed on the region state, not inline display) —
  // reading p.style.display (inline) would be empty by design and always read "shown" (the same
  // inline-vs-CSS trap that made the old transform-origin check a false-red).
  return { active: t.classList.contains("lie-region-active"), panelShown: getComputedStyle(p).display !== "none" };
})()`;

async function main() {
  const cdp = await connectOptical();
  let setupDone = false;
  try {
    const setup = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      if (!plugin) return { fatal: "plugin not loaded" };
      const vault = app.vault;
      const content = ["# Submodal region fixture", "", "plain", "![](images/sample-landscape.png){width=300}", ""].join("\\n");
      let f = vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
      if (f) await vault.modify(f, content); else f = await vault.create(${JSON.stringify(FIXTURE)}, content);
      await app.workspace.getLeaf(false).openFile(f);
      await new Promise(r => setTimeout(r, 1300));
      const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
      const cm = ed && ed.cm;
      if (!ed || !cm) return { fatal: "no editor/cm (open in Live Preview)" };
      const wrap = Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block,.lie-wrapper"))
        .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === 4; } catch (e) { return false; } });
      const img = wrap && wrap.querySelector("img");
      if (!img) return { fatal: "no image at line 4" };
      plugin.activeImage = img; window.__srImg = img;
      const b = img.getBoundingClientRect();
      return { ok: true, img: { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom } };
    })()`);
    setupDone = true;
    if (!setup || setup.fatal || !setup.ok) throw new Error("setup: " + JSON.stringify(setup));
    const I = setup.img;

    // hover the image (real), then open the filter panel (beside-image → a real gap to travel)
    await cdp.hover(I.x + I.w / 2, I.y + I.h / 2);
    await sleep(200);
    const open = await cdp.evaluate(`(async () => {
      const plugin = app.plugins.plugins["live-image-editor"];
      plugin.activeImage = window.__srImg;
      plugin.toggleFilters();
      await new Promise(r => setTimeout(r, 350));
      const region = window.__srImg.closest(".lie-wrapper");
      const panel = document.querySelector(".lie-submenu");
      const toolbar = document.querySelector(".lie-toolbar-inactive");
      if (!region || !panel || !toolbar) return { fatal: "missing region/panel/toolbar el" };
      window.__srRegion = region; window.__srPanel = panel; window.__srToolbar = toolbar;
      const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      const aBtn = toolbar.querySelector(".lie-toolbar-btn");
      return { ok: true,
        greyedWhileOpen: toolbar.classList.contains("lie-toolbar-inactive"),
        opacity: getComputedStyle(toolbar).opacity,
        barPE: getComputedStyle(toolbar).pointerEvents,
        btnPE: aBtn ? getComputedStyle(aBtn).pointerEvents : "none",
        panel: rect(panel), toolbar: rect(toolbar), img: rect(window.__srImg) };
    })()`);
    if (!open || open.fatal || !open.ok) throw new Error("open: " + JSON.stringify(open));

    const R = {};
    R.greyedWhileOpen = open.greyedWhileOpen === true;
    R.greyedNotFullWhileShown = open.opacity === "0.4";
    R.barHoverableWhileActive = open.barPE !== "none";
    R.barButtonsInertWhileActive = open.btnPE === "none";
    const st0 = await cdp.evaluate(STATE);
    R.initBothShown = st0.active === true && st0.panelShown === true;

    // a gap point between the image and the (side-docked) panel, at a shared height
    const P = open.panel, IMG = open.img, T = open.toolbar;
    const gapX = P.x >= IMG.r ? (IMG.r + P.x) / 2 : P.r <= IMG.x ? (P.r + IMG.x) / 2 : (P.x + P.r) / 2;
    const gapY = (Math.max(IMG.y, P.y) + Math.min(IMG.b, P.b)) / 2;

    // (1) travel image → gap → panel: the region stays up (grace bridges the gap, the panel catches)
    await cdp.hover(IMG.x + IMG.w / 2, IMG.y + IMG.h / 2); await sleep(120);
    await cdp.hover(gapX, gapY); await sleep(80);
    await cdp.hover(P.x + P.w / 2, P.y + P.h / 2); await sleep(300);
    const stTravel = await cdp.evaluate(STATE);
    R.travelKeepsRegion = stTravel.active === true && stTravel.panelShown === true;

    // (2) while active, the greyed toolbar is a region member: panel → toolbar keeps both up
    await cdp.hover(T.x + T.w / 2, T.y + T.h / 2); await sleep(300);
    const stBar = await cdp.evaluate(STATE);
    R.toolbarIsRegionMember = stBar.active === true && stBar.panelShown === true;

    // (3) move the pointer OUT of the whole region → both hide together
    await cdp.hover(2, 2); await sleep(500);
    const stLeft = await cdp.evaluate(STATE);
    R.bothHideOnLeave = stLeft.active === false && stLeft.panelShown === false;

    // (4) re-enter via the IMAGE → both come back together
    await cdp.hover(IMG.x + IMG.w / 2, IMG.y + IMG.h / 2); await sleep(350);
    const stBack = await cdp.evaluate(STATE);
    R.imageReEntersRegion = stBack.active === true && stBack.panelShown === true;

    const order = [
      ["toolbar is greyed while the panel is open", "greyedWhileOpen"],
      ["on open: toolbar + panel both shown (one region)", "initBothShown"],
      ["shown bar is GREYED (opacity 0.4), never un-greyed (Bug 63)", "greyedNotFullWhileShown"],
      ["greyed bar is a real hover surface (pointer-events:auto)", "barHoverableWhileActive"],
      ["greyed bar's buttons stay inert (D6 inactive)", "barButtonsInertWhileActive"],
      ["travel image→gap→panel keeps the region (real pointer)", "travelKeepsRegion"],
      ["the greyed toolbar is a region member (panel→toolbar keeps it)", "toolbarIsRegionMember"],
      ["leaving the whole region hides BOTH together (real pointer)", "bothHideOnLeave"],
      ["re-entering via the image brings both back", "imageReEntersRegion"],
    ];
    let failed = 0;
    for (const [name, key] of order) { const v = R[key]; console.log(`${v ? "PASS" : "FAIL"}  ${name}`); if (!v) failed++; }
    console.log(`\n${order.length - failed}/${order.length} passed`);
    console.log("  raw:", JSON.stringify(R));
    if (failed) { console.error("\nSubmodal region check FAILED"); process.exitCode = 1; }
    else console.log("submodal active-region check OK");
  } finally {
    if (setupDone) {
      await cdp.evaluate(`(async () => {
        try { const p = app.plugins.plugins["live-image-editor"]; if (p && document.querySelector(".lie-submenu")) p.toggleFilters(); } catch (e) {}
        try { const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}); if (f) await app.vault.delete(f); } catch (e) {}
        try { delete window.__srImg; delete window.__srRegion; delete window.__srPanel; delete window.__srToolbar; } catch (e) {}
      })()`).catch(() => {});
    }
    cdp.close();
  }
}

main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(2); });
