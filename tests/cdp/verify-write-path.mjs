#!/usr/bin/env node
// §3 AD1 WRITE-PATH MATRIX — the runnable, load-bearing integration check (the Bug 56 guard).
//
// It drives EVERY toolbar/menu op in the running vault and READS THE REAL SOURCE `{…}` BACK,
// asserting the op's key landed — never assuming the DOM changed. It also runs the Bug 56
// duplicate-image case: an op on the SECOND embed of a repeated file must write to the SECOND
// line, not the first basename match. This is exactly the check Bug 56 slipped through (only the
// resize handle's `width`, via its separate posAtDOM path, persisted).
//
// Prereqs (CLAUDE.md → Live debugging): a dev build installed in vault-image-toolbar/ and Obsidian running
// with the CDP relay. Run from the repo root:
//   node tests/cdp/verify-write-path.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "vault-image-toolbar").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "vault-image-toolbar",
};

// Two evals: the async RUN stashes its JSON result on `window.__WPM` (the bridge does not capture
// an async eval's resolved value — it prints `{}` — but side effects persist), then the sync READ
// returns the stashed string. The fixture has one distinct image (the per-op matrix) + two
// same-file images (the Bug 56 dup guard); the run drives each op through the real handlers, reads
// the source line back, then deletes the fixture.
const EVAL_RUN = `(async () => {
  window.__WPM = "";
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__WPM = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_wpm-fixture.md";
    const content = [
      "# Write-path matrix fixture", "",
      "single", "![](images/sample-portrait.png)", "",
      "first", "![](images/sample-landscape.png)", "",
      "second", "![](images/sample-landscape.png)", "",
    ].join("\\n");
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 1000));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    const cm = ed && ed.cm;
    if (!ed || !cm) { await vault.delete(f); window.__WPM = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    ed.setCursor({ line: 0, ch: 0 });
    const at = (n) => Array.from(document.querySelectorAll(".lie-wrapper-standalone,.lie-wrapper-block"))
      .find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === n; } catch (e) { return false; } });
    const lineText = (n) => ed.getLine(n - 1).replace(/!\\[\\]\\([^)]*\\)/, "");
    const SINGLE = 4; // 1-based line of the portrait image; landscapes at 7 (first) and 10 (second)

    const matrix = {};
    const op = (name, fn) => {
      const w = at(SINGLE); const img = w && w.querySelector("img");
      if (!img) { matrix[name] = "NO-IMG"; return; }
      plugin.activeImage = img;
      try { fn(); } catch (e) { matrix[name] = "ERR " + e; return; }
      matrix[name] = lineText(SINGLE);
    };
    op("rotateCw", () => plugin.rotateCw());
    op("flipH", () => plugin.flipH());
    op("flipV", () => plugin.flipV());
    op("filter", () => plugin.modifyTransform((t) => { t.filter = "brightness(1.2)"; }));
    op("alignLeft", () => plugin.applyLayout("float-left"));   // Decision 30: float-left ⇒ align=left
    op("presetMedium", () => plugin.applyPreset("medium"));
    op("inline", () => plugin.applyLayout("inline"));           // Decision 30: inline layout ⇒ .lie-inline
    op("addClass", () => plugin.applyClass("rounded"));
    op("crop", () => plugin.modifyTransform((t) => { t.transform = "translate(-10%, -5%) scale(1.5)"; t.aspectRatio = "4/3"; t.width = "240px"; }));
    op("reset", () => plugin.reset());
    op("rotateCcw", () => plugin.rotateCcw());

    // Bug 56 dup guard: rotate the SECOND landscape (line 10); the SECOND must change, the FIRST (line 7) must not.
    const dup = {};
    const second = at(10); const img2 = second && second.querySelector("img");
    if (img2) {
      plugin.activeImage = img2;
      plugin.rotateCw();
      dup.first = lineText(7);
      dup.second = lineText(10);
    } else { dup.error = "no second image"; }

    await vault.delete(f);
    window.__WPM = JSON.stringify({ matrix, dup });
  } catch (e) { window.__WPM = JSON.stringify({ fatal: String(e) }); }
})()`;

const EVAL_READ = `window.__WPM || ""`;

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
  // Fire the async RUN (the bridge does not await it), then POLL the sync READ until __WPM is set.
  execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_RUN], { env, encoding: "utf8" });
  for (let i = 0; i < 20; i++) {
    sleep(1000);
    const out = execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_READ], { env, encoding: "utf8" });
    const res = parseResult(out);
    if (res) return res;
  }
  throw new Error("timed out waiting for window.__WPM (the RUN eval did not finish)");
}

const res = runEval();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }

const m = res.matrix ?? {};
const has = (s, sub) => typeof s === "string" && s.includes(sub);
const checks = [
  ["rotate cw persists rotate=", has(m.rotateCw, "rotate=")],
  ["flip h persists flip=horizontal", has(m.flipH, "flip=horizontal")],
  ["flip v persists flip=vertical", has(m.flipV, "flip=vertical")],
  ["filter persists filter=", has(m.filter, "filter=")],
  ["align left persists align=left", has(m.alignLeft, "align=left")],
  ["preset medium persists width=", has(m.presetMedium, "width=")],
  ["inline persists .lie-inline", has(m.inline, ".lie-inline")],
  ["add-class persists .rounded", has(m.addClass, ".rounded")],
  ["crop persists transform=", has(m.crop, "transform=")],
  ["crop persists aspect-ratio=", has(m.crop, "aspect-ratio=")],
  ["reset clears the block", m.reset === "" || m.reset === " "],
  ["rotate ccw persists rotate= (after reset)", has(m.rotateCcw, "rotate=")],
  // Bug 56: the op on the SECOND duplicate-file image hits the SECOND line, not the first.
  ["Bug 56: 2nd image op writes the 2nd line", has(res.dup?.second, "rotate=")],
  ["Bug 56: the 1st image is untouched", !has(res.dup?.first, "{")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed) { console.error("\nWrite-path matrix FAILED — details:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("write-path matrix OK");
