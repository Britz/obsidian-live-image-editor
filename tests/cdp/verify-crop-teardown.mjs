#!/usr/bin/env node
// Bug-43 CROP TEARDOWN CHECK — structural proof that the in-place crop editor fully tears down EVERY
// transient override on EVERY exit path (test-plan §3). The load-bearing one is the BODY PORTAL
// (Variante B): crop appends a `.lie-crop-portal` to `document.body` carrying the dim ghost + handle
// chrome that escape the host's HONOURED `contain:paint`, plus scroll/resize reposition listeners; if
// any exit failed to remove it, the portal (and its listeners) would leak onto the page. The host
// `contain:paint` is NOT lifted any more — it stays "paint" throughout (asserted). There is ONE
// teardown (`exitCropMode`) run from the single `onClose` that `AnchoredSubmenu.close()` calls on
// EVERY exit — this check proves it empirically per path by reading the live DOM/style back.
//
// For each exit path it asserts: (active) `.lie-cropping` on area+host, host `contain` STAYS "paint",
// the `.lie-crop-portal` present with ghost+8 handles inside it; (restored) `.lie-cropping` gone
// everywhere, the portal removed, host `contain` still its PRE-CROP baseline, NO orphan `.lie-crop-*`
// nodes, the img back in a clean 3-layer box, and no console exception.
// Run from the repo root:  node tests/cdp/verify-crop-teardown.mjs
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "vault-image-toolbar",
};

const EVAL_RUN = `(async () => {
  window.__TD = "";
  const out = { paths: {}, fatal: null };
  const errs = [];
  const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(" ")); oe.apply(console, a); };
  const onErr = (e) => errs.push("UNCAUGHT " + (e.error && e.error.stack || e.message));
  window.addEventListener("error", onErr);
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { out.fatal = "plugin not loaded"; window.__TD = JSON.stringify(out); return; }
    const vault = app.vault;
    const PATH = "_td-fixture.md";
    // A BARE embed (no brace block) renders as a .lie-wrapper-block widget — the one host that
    // carries app.css contain:paint (!important). Variante B HONOURS that containment (no lift); the
    // load-bearing case is that the body portal — which escapes it — is fully removed on every exit.
    const BARE = "![](images/sample-landscape.png)";
    const content = ["# Crop teardown fixture", "", "crop", BARE, ""].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1200));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { out.fatal = "no editor/cm (open in LP)"; await vault.delete(f); window.__TD = JSON.stringify(out); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const LINE = 4;
    const findImg = () => {
      const w = Array.from(document.querySelectorAll(".lie-wrapper-block,.lie-wrapper-standalone"))
        .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === LINE; } catch (e) { return false; } });
      return w && w.querySelector("img");
    };
    const block = () => (ed.getLine(LINE - 1).match(/\\{([^}]*)\\}/) || [, ""])[1];

    const orphans = () => document.querySelectorAll(".lie-crop-portal,.lie-crop-veil,.lie-crop-chrome,.lie-crop-handles,.lie-crop-ghost-img").length;
    const anyCropping = () => document.querySelectorAll(".lie-cropping").length;
    const portal = () => document.querySelector(".lie-crop-portal");
    // macOS trackpad rotate-gesture leak check: the editor subscribes one rotate-gesture listener
    // on the Electron window per open and MUST remove it on every exit. Count it directly (n/a off
    // macOS, where nothing is subscribed -> no leak by construction).
    const gwin = (() => { try { return window.require("@electron/remote").getCurrentWindow(); } catch (e) { return null; } })();
    const rgAvailable = (() => { try { return window.require("process").platform === "darwin" && !!gwin && typeof gwin.listenerCount === "function"; } catch (e) { return false; } })();
    const rgCount = () => (rgAvailable ? gwin.listenerCount("rotate-gesture") : -1);
    const inlineContainLeak = () => Array.from(document.querySelectorAll(".lie-wrapper,.image-embed"))
      .some((h) => h.style.contain && h.style.contain !== "");

    // Drive one exit path; returns its active+restored assertion bag.
    const runPath = async (name, dirty, exit) => {
      await vault.modify(f, content);             // reset to the bare (block-widget) image
      await new Promise((r) => setTimeout(r, 1200));
      const img = findImg();
      if (!img) { out.paths[name] = { fatal: "no img" }; return; }
      plugin.activeImage = img;
      const area0 = img.closest(".lie-image-area");
      const host0 = img.closest(".lie-wrapper, .image-embed");
      const preContain = getComputedStyle(host0).contain;
      const preOverflow = getComputedStyle(area0).overflow;
      const rgPre = rgCount();
      const before = errs.length;

      plugin.crop();
      await new Promise((r) => setTimeout(r, 220));
      const area = img.closest(".lie-image-area");
      const host = img.closest(".lie-wrapper, .image-embed");
      const active = {
        areaCropping: !!area && area.classList.contains("lie-cropping"),
        hostCropping: !!host && host.classList.contains("lie-cropping"),
        // Variante B: the host's containment is HONOURED, never lifted — it stays whatever it was
        // pre-crop (a block widget keeps "paint"; a standalone keeps "none"). The old bug lifted it.
        hostContainUnchanged: !!host && getComputedStyle(host).contain === preContain,
        // The overflow lives in the BODY PORTAL now (escaping containment), not in the area.
        portalPresent: !!portal(),
        ghost: !!document.querySelector(".lie-crop-portal .lie-crop-ghost-img"),
        handles8: document.querySelectorAll(".lie-crop-portal .lie-crop-handle").length === 8,
        // On macOS the open subscribed exactly one rotate-gesture listener; elsewhere n/a (passes).
        rotateGestureSubscribed: rgAvailable ? rgCount() === rgPre + 1 : true,
      };

      if (dirty) {
        const r = area.getBoundingClientRect();
        area.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
        document.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2 + 30, clientY: r.top + r.height / 2 + 18, bubbles: true }));
        document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      }
      await exit();
      await new Promise((r) => setTimeout(r, 250));

      const img2 = findImg() || img;
      const area2 = img2.closest(".lie-image-area");
      // The load-bearing leak check: NO live block widget may be left with contain:none. Covers
      // both cases — the same host (no rebuild) and a rebuilt-as-different host on commit.
      const blockHosts = Array.from(cm.dom.querySelectorAll(".lie-wrapper-block"));
      const restored = {
        noCroppingAnywhere: anyCropping() === 0,
        // The load-bearing teardown (Variante B): the body portal — with its ghost/chrome AND its
        // scroll/resize reposition listeners — is gone after every exit path.
        portalRemoved: !portal(),
        // app.css default re-applies on every live block widget → nothing stuck at "none" (an empty
        // set passes: a committed crop legitimately turns the bare image into a standalone widget).
        noStuckContainment: blockHosts.every((h) => getComputedStyle(h).contain === "paint"),
        // the SAME host that was lifted (when it survives — the no-op path keeps it a block widget):
        // contain round-trips paint → none → paint on the very element, directly proving removeProperty.
        sameHostRestored: !host0.isConnected || getComputedStyle(host0).contain === preContain,
        inlineContainRemoved: !inlineContainLeak(),
        overflowRestored: !!area2 && getComputedStyle(area2).overflow === preOverflow,
        noOrphanChrome: orphans() === 0,
        cleanThreeLayer: !!(area2 && img2.closest(".lie-frame") && img2.closest(".lie-image-area")),
        imageRenders: !!img2 && img2.offsetWidth > 0,
        noNewConsoleError: errs.length === before,
        persisted: dirty ? /transform=/.test(block()) : true,
        // The exit removed the gesture listener — back to the pre-crop count (no leak across paths).
        noRotateGestureLeak: rgCount() === rgPre,
      };
      out.paths[name] = { preContain, preOverflow, hostClass: host0.className, active, restored,
        rgAvailable, rgPre, rgPost: rgCount(),
        blockHostContains: blockHosts.map((h) => getComputedStyle(h).contain) };
    };

    // 1) no-op leave (clean) FIRST — keeps the bare image a BLOCK widget (no commit, no rebuild), so
    // it directly proves the contain round-trip paint → none → paint on the SAME element.
    await runPath("noop_closeCrop", false, async () => plugin.closeCrop());
    // 2) confirm/auto-persist on menu-leave (dirty) — represents close()/toggle/dismiss/select-other
    await runPath("confirm_closeCrop", true, async () => plugin.closeCrop());
    // 3) Esc (dirty) — the host's own capture-phase keydown path
    await runPath("esc", true, async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    // 4) context loss (a menu/modal opens) — the MutationObserver path → dismissToolbar → closeCrop.
    // NOTE: click-away is deliberately NOT a crop teardown path — crop is click-away EXEMPT (Bug 62;
    // a stray click must leave the in-place session open), proven by tests/cdp/verify-region-clickaway.mjs.
    // So the dismissToolbar → closeCrop chain is exercised here via the context-loss observer instead.
    await runPath("contextloss_menu", true, async () => {
      const m = document.createElement("div"); m.className = "menu lie-td-fake"; document.body.appendChild(m);
      await new Promise((r) => setTimeout(r, 80)); m.remove();
    });

    await vault.delete(f);
    out.consoleErrors = errs;
    window.__TD = JSON.stringify(out);
  } catch (e) {
    out.fatal = String(e && e.stack || e); window.__TD = JSON.stringify(out);
  } finally { console.error = oe; window.removeEventListener("error", onErr); }
})()`;

const EVAL_READ = `window.__TD || ""`;

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
  for (let i = 0; i < 30; i++) {
    sleep(1000);
    const out = execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_READ], { env, encoding: "utf8" });
    const res = parseResult(out);
    if (res) return res;
  }
  throw new Error("timed out waiting for window.__TD");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }

let failed = 0;
const ACTIVE = ["areaCropping", "hostCropping", "hostContainUnchanged", "portalPresent", "ghost", "handles8",
  "rotateGestureSubscribed"];
const RESTORED = ["noCroppingAnywhere", "portalRemoved", "noStuckContainment", "sameHostRestored", "inlineContainRemoved",
  "overflowRestored", "noOrphanChrome", "cleanThreeLayer", "imageRenders", "noNewConsoleError", "persisted",
  "noRotateGestureLeak"];
for (const [name, p] of Object.entries(res.paths)) {
  if (p.fatal) { console.log(`FAIL  [${name}] ${p.fatal}`); failed++; continue; }
  console.log(`\n[${name}]  host="${p.hostClass}"  pre-crop contain="${p.preContain}"  rotate-gesture[avail=${p.rgAvailable} pre=${p.rgPre} post=${p.rgPost}]`);
  for (const k of ACTIVE) { const ok = p.active[k]; console.log(`  ${ok ? "PASS" : "FAIL"}  active:${k}`); if (!ok) failed++; }
  for (const k of RESTORED) { const ok = p.restored[k]; console.log(`  ${ok ? "PASS" : "FAIL"}  restored:${k}`); if (!ok) failed++; }
}
console.log(`\n${failed === 0 ? "ALL PATHS RESTORE — no leak" : failed + " assertion(s) FAILED"}`);
if (res.consoleErrors && res.consoleErrors.length) console.log("console errors:", JSON.stringify(res.consoleErrors));
if (failed) { console.error("\nTeardown check FAILED — raw:", JSON.stringify(res.paths, null, 2)); process.exit(1); }
console.log("crop teardown check OK");
