#!/usr/bin/env node
// LP REVEAL CLUSTER guard (Bug 45–47) — a runnable, read-the-real-DOM CDP check.
//
//   Bug 45: the toolbar reveal toggle renders the `<>` (Lucide "code") icon, not an eye.
//   Bug 46: a `<>` dismiss hides the WHOLE raw embed — the fake `![](…)` link AND the `{…}`.
//   Bug 47: the revealed `{…}` carries CM URL tokens (syntax highlighted), not plain text.
//
// Prereqs (CLAUDE.md → Live debugging): a dev build installed in example-vault/ + Obsidian running with
// the CDP relay. Run from the repo root:  node tests/cdp/verify-reveal.mjs
// Override the endpoint with CDP_HOST / CDP_PORT / CDP_TARGET (defaults host.containers.internal,
// 9223 direct to Obsidian's own CDP, target "example-vault").
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  CDP_PORT: process.env.CDP_PORT ?? "9223",
  CDP_TARGET: process.env.CDP_TARGET ?? "example-vault",
};

// async RUN stashes its result on window.__REV (the bridge does not capture an async eval's
// resolved value); the sync READ returns it. Uses `always` mode so the source is revealed without
// a real pointer hover, and the per-line `<>` dismiss persists (no auto-clear in always mode).
const EVAL_RUN = `(async () => {
  window.__REV = "";
  try {
    const plugin = app.plugins.plugins["live-image-editor"];
    if (!plugin) { window.__REV = JSON.stringify({ fatal: "plugin not loaded" }); return; }
    const vault = app.vault;
    const PATH = "_reveal-fixture.md";
    const content = "# Reveal fixture\\n\\n![](images/sample-portrait.png){width=200}\\n";
    let f = vault.getAbstractFileByPath(PATH);
    if (f) await vault.modify(f, content); else f = await vault.create(PATH, content);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 900));
    const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
    if (!ed || !ed.cm) { await vault.delete(f); window.__REV = JSON.stringify({ fatal: "no editor/cm (open in LP)" }); return; }
    plugin.settings.alwaysShowLink = true; plugin.refreshLivePreviewDecorations();
    ed.setCursor({ line: 0, ch: 0 });
    await new Promise((r) => setTimeout(r, 200));

    const disp = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : "(no-el)"; };
    const icon = (() => { const s = document.querySelector(".lie-toolbar-reveal svg"); return s ? s.getAttribute("class") : "(no-svg)"; })();
    const attr = document.querySelector(".lie-attr");
    const attrHighlighted = !!attr && (/cm-url/.test(attr.className) || attr.querySelectorAll("[class*=cm-]").length > 0);

    const before = { fake: disp(".lie-fake-link"), attr: disp(".lie-attr") };
    const btn = document.querySelector(".lie-toolbar-reveal");
    if (btn) btn.click(); // dismiss
    await new Promise((r) => setTimeout(r, 150));
    const after = { fake: disp(".lie-fake-link"), attr: disp(".lie-attr") };

    plugin.settings.alwaysShowLink = false; plugin.refreshLivePreviewDecorations();
    await vault.delete(f);
    window.__REV = JSON.stringify({ icon, attrHighlighted, before, after });
  } catch (e) { window.__REV = JSON.stringify({ fatal: String(e) }); }
})()`;

const EVAL_READ = `window.__REV || ""`;

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

function run() {
  execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_RUN], { env, encoding: "utf8" });
  for (let i = 0; i < 15; i++) {
    sleep(1000);
    const out = execFileSync("node", ["scripts/obsidian-debug.mjs", "--eval", EVAL_READ], { env, encoding: "utf8" });
    const res = parseResult(out);
    if (res) return res;
  }
  throw new Error("timed out waiting for window.__REV");
}

const res = run();
if (res.fatal) { console.error("FATAL:", res.fatal); process.exit(2); }

const checks = [
  ["Bug 45: reveal icon is `<>` (lucide-code), not an eye", /lucide-code/.test(res.icon || "")],
  ["Bug 47: revealed {…} is syntax-highlighted (CM url tokens)", res.attrHighlighted === true],
  ["Bug 46: source revealed before dismiss (fake + attr shown)", res.before?.fake === "inline" && res.before?.attr === "inline"],
  ["Bug 46: dismiss hides the fake `![](…)` link", res.after?.fake === "none"],
  ["Bug 46: dismiss hides the `{…}` block", res.after?.attr === "none"],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed) { console.error("\nReveal cluster FAILED — details:", JSON.stringify(res, null, 2)); process.exit(1); }
console.log("reveal cluster OK");
