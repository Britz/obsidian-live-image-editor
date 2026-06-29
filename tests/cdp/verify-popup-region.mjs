#!/usr/bin/env node
// GROUP POPUP ↔ TOOLBAR = ONE REGION, NOT GREYED (Bug 64; D6; test-plan §3, Lesson 6 — the obsidian/
// CM-coupled half, not a vitest unit). A lightweight group popup (`.lie-group-popup`) sits on
// document.body, OUTSIDE the `.lie-wrapper` paint box, so without coupling, hovering it drops the
// in-chrome bar's `.lie-wrapper:hover` and the bar vanishes. This drives the region's hover state
// machine with the synthetic enter/leave the host's listeners consume and asserts the bar + popup
// form ONE region — visibility coupled, but NOT modal/greyed:
//   • on open: the popup exists, the wrapper carries `.lie-region-hover`, and the in-chrome bar is
//     NOT `.lie-toolbar-inactive` (palettes never grey the bar — unlike the modal sub-menu host);
//   • hovering the popup (after leaving the image) keeps the bar VISIBLE (computed opacity 1, driven
//     by `.lie-region-hover` regardless of CSS `:hover`) and keeps the popup open;
//   • leaving the WHOLE region closes the popup AND drops `.lie-region-hover` — bar + popup go together.
// The real-pointer `:hover` travel path is a manual focused-window check (Input.dispatchMouseEvent
// can't drive CSS `:hover`); the STRUCTURAL region state is asserted here against the live DOM.
//
// Prereqs (CLAUDE.md → Live debugging): a DEV build installed in vault-image-toolbar/ and Obsidian running with
// the CDP relay. Run from the repo root:  node tests/cdp/verify-popup-region.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults: host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "vault-image-toolbar").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "vault-image-toolbar",
};

const EVAL_RUN = `(async () => {
  window.__POPREGION = "";
  const R = {};
  const ok = (k, v) => { R[k] = v; };
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__POPREGION = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_popup-region-fixture.md";
    const content = [
      "# Popup region fixture", "",
      "plain", "![](images/sample-landscape.png)", "",
    ].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1200));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__POPREGION = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const LINE = 4;
    const wrapAt = () => Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
      .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === LINE; } catch (e) { return false; } });
    const wrapper = wrapAt();
    const bar = wrapper && wrapper.querySelector(".lie-toolbar-in-image");
    if (!wrapper || !bar) {
      await vault.delete(f);
      window.__POPREGION = JSON.stringify({ fatal: "no in-chrome toolbar (image floated? need a non-float image)" });
      return;
    }

    // Force a group to FOLD so its submenu trigger is visible, then click it to open the popup
    // (the exact path the user takes when the bar runs out of room).
    const slot = bar.querySelector(".lie-toolbar-group-slot");
    if (!slot) { await vault.delete(f); window.__POPREGION = JSON.stringify({ fatal: "no group slot in toolbar" }); return; }
    slot.classList.add("is-folded");
    const trigger = slot.querySelector(".lie-toolbar-group-trigger");
    if (!trigger) { await vault.delete(f); window.__POPREGION = JSON.stringify({ fatal: "no group trigger" }); return; }
    trigger.click();
    await sleep(60);
    const popup = document.querySelector(".lie-group-popup");
    if (!popup) { await vault.delete(f); window.__POPREGION = JSON.stringify({ fatal: "popup did not open" }); return; }

    const fire = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: false }));
    const regionHover = () => wrapper.classList.contains("lie-region-hover");
    const barGreyed = () => bar.classList.contains("lie-toolbar-inactive");
    const barOpacity = () => getComputedStyle(bar).opacity;

    // (0) On open: popup up, wrapper marked region-hover, bar NOT greyed (palette ≠ modal).
    ok("popupOpen", !!popup);
    ok("regionHoverOnOpen", regionHover());
    ok("barNotGreyed", !barGreyed());

    // (1) Leave the image, arrive on the popup: bar stays VISIBLE (region-hover forces opacity 1)
    //     and the popup stays open — the body-level popup is part of the region.
    fire(wrapper, "mouseleave");
    fire(popup, "mouseenter");
    await sleep(80);
    ok("popupKeepsRegion", regionHover() && !!document.querySelector(".lie-group-popup"));
    ok("barVisibleWhileOnPopup", barOpacity() === "1");
    ok("barStillNotGreyed", !barGreyed());

    // (2) Leave the WHOLE region (off the popup, nothing else entered): popup CLOSES and
    //     .lie-region-hover drops — bar + popup go together.
    fire(popup, "mouseleave");
    await sleep(280);
    ok("popupClosedOnLeave", !document.querySelector(".lie-group-popup"));
    ok("regionHoverDropped", !regionHover());

    await vault.delete(f);
    window.__POPREGION = JSON.stringify({ checks: R });
  } catch (e) { window.__POPREGION = JSON.stringify({ fatal: String(e && e.stack || e) }); }
})()`;

const EVAL_READ = `window.__POPREGION || ""`;

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
  throw new Error("timed out waiting for window.__POPREGION (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }
const c = res.checks ?? {};
const order = [
  ["group popup opened", "popupOpen"],
  ["wrapper marked .lie-region-hover on open", "regionHoverOnOpen"],
  ["in-chrome bar is NOT greyed (palette ≠ modal)", "barNotGreyed"],
  ["hovering the popup keeps the region (popup stays)", "popupKeepsRegion"],
  ["bar stays VISIBLE while on the popup (opacity 1)", "barVisibleWhileOnPopup"],
  ["bar stays NOT greyed while on the popup", "barStillNotGreyed"],
  ["leaving the region CLOSES the popup", "popupClosedOnLeave"],
  ["leaving the region drops .lie-region-hover (bar fades too)", "regionHoverDropped"],
];
let failed = 0;
for (const [name, key] of order) {
  const v = c[key];
  console.log(`${v ? "PASS" : "FAIL"}  ${name}`);
  if (!v) failed++;
}
console.log(`\n${order.length - failed}/${order.length} passed`);
if (failed) { console.error("\nGroup popup region check FAILED — raw:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("group popup region check OK (coupled visibility, not greyed)");
