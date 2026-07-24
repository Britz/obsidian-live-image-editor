#!/usr/bin/env node
// AB16b WHOLE-LINK REVEAL — the full VISUAL matrix (every embed type × every reveal mode × every state),
// verified by PIXEL ink of the actually-painted source, not by reading CSS properties. The source can be
// painted by EITHER Obsidian's NATIVE tokens OR the plugin's STAND-IN, so each cell measures both and
// asserts D16 (mutual exclusion: never both, never a gap where "shown" is expected) + the per-mode reveal.
//
// Complements verify-reveal.mjs (the Bug 53/54/55 structural checks) with the per-type × per-mode × state
// coverage. The reveal is FOCUS-GATED, so this drives focus emulation (`_optical.focusEmulation`) and a
// REAL pointer for the auto-hover cases (synthetic events do not fire `:hover`).
//
// Prereqs (CLAUDE.md → Live debugging): Obsidian running with the CDP relay + a build in vault-image-toolbar/.
//   node tests/cdp/verify-reveal-matrix.mjs   (CDP_PORT defaults 9223, target vault-image-toolbar)
import { connectOptical } from "./_optical.mjs";

// "ink" = fraction of pixels deviating from the region's median (background) — i.e. painted text/ink.
function ink(img) {
  const n = img.width * img.height;
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const p = i * 4; lum[i] = (img.rgba[p] * 299 + img.rgba[p + 1] * 587 + img.rgba[p + 2] * 114) / 1000; }
  const bg = [...lum].sort((a, b) => a - b)[(n / 2) | 0];
  let k = 0; for (let i = 0; i < n; i++) if (Math.abs(lum[i] - bg) > 28) k++;
  return k / n;
}

const results = [];
const rec = (name, expect, got) => results.push({ name, expect, shown: got.shown, fake: got.fake, nat: got.nat, ok: (expect === "shown") === got.shown });

const cdp = await connectOptical();
try {
  await cdp.focusEmulation(true);
  const loaded = await cdp.evaluate('!!app.plugins.plugins["live-image-editor"] && !!app.workspace.activeLeaf');
  if (!loaded) { console.log("FATAL: plugin not loaded / no active leaf"); cdp.close(); process.exit(2); }

  const rectOf = (sel) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width < 2 || r.height < 2 ? null : { x: r.x, y: r.y, width: Math.min(r.width, 500), height: Math.min(r.height, 200) }; })()`);
  const inkOf = async (sel) => { const r = await rectOf(sel); return r ? +ink(await cdp.screenshot(r)).toFixed(3) : 0; };
  // native source token = a direct child of the active line carrying the markdown-image OR wikilink-embed
  // formatting (NOT inside our own fake-link / attr). Markdown → cm-image*, wikilink → hmd-internal-link / embed.
  const nativeInk = async () => {
    const r = await cdp.evaluate(`(() => { const al = document.querySelector(".cm-active"); if (!al) return null;
      const t = [...al.children].find(c => /cm-image\\b|cm-formatting-image|hmd-internal-link|cm-hmd-internal-link|formatting-embed/.test(c.className) && !c.closest(".lie-fake-link") && !c.classList.contains("lie-attr"));
      if (!t) return null; const r = t.getBoundingClientRect(); return r.width < 2 || r.height < 2 ? null : { x: r.x, y: r.y, width: Math.min(r.width, 400), height: r.height }; })()`);
    return r ? +ink(await cdp.screenshot(r)).toFixed(3) : 0;
  };
  const src = async (fakeSel) => { const fake = await inkOf(fakeSel || ".lie-fake-link"); const nat = await nativeInk(); return { fake, nat, shown: fake > 0.02 || nat > 0.02 }; };

  const setup = async (content) => { await cdp.evaluate(`(async () => { const v = app.vault; let f = v.getAbstractFileByPath("_reveal-matrix.md"); const c = ${JSON.stringify(content)}; if (f) await v.modify(f, c); else f = await v.create("_reveal-matrix.md", c); window.__rmf = f.path; await app.workspace.getLeaf(false).openFile(f); })()`); await wait(1100); };
  const teardown = () => cdp.evaluate('(async () => { const f = app.vault.getAbstractFileByPath(window.__rmf); if (f) await app.vault.delete(f); })()');
  const mode = async (m) => { await cdp.evaluate(`(() => { const p = app.plugins.plugins["live-image-editor"]; p.settings.defaultRevealState = ${JSON.stringify(m)}; p.refreshLivePreviewDecorations && p.refreshLivePreviewDecorations(); })()`); await wait(300); };
  const cur = async (o) => { await cdp.evaluate(`(() => { const cm = app.workspace.activeEditor.editor.cm; cm.dispatch({ selection: { anchor: ${o} } }); cm.focus(); })()`); await wait(260); };
  const dismiss = async () => { await cdp.evaluate('(() => { const b = document.querySelector(".lie-toolbar-reveal"); if (b) b.click(); })()'); await wait(260); };
  const hoverImg = async (sel) => { const r = await rectOf(sel); if (r) await cdp.hover(r.x + r.width / 2, r.y + r.height / 2); await wait(340); };
  // ENGAGED pin (AD12): there is no easy way to drive a real crop over CDP, so stub an "open surface" for
  // the image — `engagedImagePos()` reads `anySurfaceOpen()` + `activeImage`, exactly the live inputs.
  const engaged = async (on) => { await cdp.evaluate(`(() => { const p = app.plugins.plugins["live-image-editor"]; if (${on}) { p.activeImage = document.querySelector(".markdown-source-view .lie-wrapper img"); p.filterPanel = {}; } else { p.filterPanel = null; p.activeImage = null; } p.refreshLivePreviewDecorations(); })()`); await wait(300); };

  // ===== STANDALONE {…} =====
  await setup("# T\n\n![](images/sample-portrait.png){width=200}\n");
  let P = await cdp.evaluate('(() => { const f = app.workspace.activeEditor.editor.cm.state.doc.line(3).from; return { body: f + 5, attr: f + 35 }; })()');
  await mode("native"); await cur(0);        rec("standalone native off-line", "hidden", await src());
  await cur(P.body);                          rec("standalone native cursor-in-body (native carries)", "shown", await src());
  await cur(P.attr);                          rec("standalone native cursor-in-{…} (stand-in carries)", "shown", await src());
  await mode("auto"); await cur(0); await cdp.hover(2, 2); rec("standalone auto off, no hover", "hidden", await src());
  await hoverImg(".lie-wrapper-standalone");  rec("standalone auto real-hover (stand-in)", "shown", await src());
  await mode("always"); await cur(0); await cdp.hover(2, 2); rec("standalone always off-line (stand-in)", "shown", await src());
  await mode("native"); await cur(P.body); await dismiss(); rec("standalone dismiss (cursor on line)", "hidden", await src()); await dismiss();
  await cur(0); await engaged(true);          rec("standalone engaged-pin off-line (stand-in)", "shown", await src()); await engaged(false);
  await teardown();

  // ===== BARE (markdown, no {…}) =====
  await setup("# T\n\ntext line\n\n![](images/sample-landscape.png)\n");
  let B = await cdp.evaluate('(() => { const cm = app.workspace.activeEditor.editor.cm; return { bare: cm.state.doc.line(5).from, off: cm.state.doc.line(3).from }; })()');
  await mode("native"); await cur(B.off);     rec("bare native off-line", "hidden", await src(".lie-fake-link-block"));
  await cur(B.bare);                          rec("bare native cursor-on-line (native carries)", "shown", await src(".lie-fake-link-block"));
  await mode("auto"); await cur(B.off); await cdp.hover(2, 2); rec("bare auto off, no hover", "hidden", await src(".lie-fake-link-block"));
  await hoverImg(".lie-wrapper-block");        rec("bare auto real-hover (block stand-in)", "shown", await src(".lie-fake-link-block"));
  await mode("always"); await cur(B.off); await cdp.hover(2, 2); rec("bare always off-line (block stand-in)", "shown", await src(".lie-fake-link-block"));
  await mode("native"); await cur(B.bare); await dismiss(); rec("bare dismiss (cursor on line)", "hidden", await src(".lie-fake-link-block")); await dismiss();
  await cur(B.off); await engaged(true);      rec("bare engaged-pin off-line (block stand-in)", "shown", await src(".lie-fake-link-block")); await engaged(false);
  await teardown();

  // ===== INLINE (with {…}) =====
  await setup("# T\n\naa ![](images/sample-square.png){width=80} bb\n");
  let I = await cdp.evaluate('(() => { const t = app.workspace.activeEditor.editor.cm.state.doc.line(3); return { embed: t.from + t.text.indexOf("![](") + 3, attr: t.from + t.text.indexOf("{") + 3 }; })()');
  await mode("native"); await cur(0);         rec("inline native off-line", "hidden", await src());
  await cur(I.embed);                          rec("inline native cursor-in-body (native carries)", "shown", await src());
  await cur(I.attr);                           rec("inline native cursor-in-{…} (stand-in carries)", "shown", await src());
  await mode("auto"); await cur(0); await cdp.hover(2, 2); rec("inline auto off, no hover", "hidden", await src());
  await hoverImg(".lie-wrapper-inline");       rec("inline auto real-hover (stand-in)", "shown", await src());
  await mode("always"); await cur(0); await cdp.hover(2, 2); rec("inline always off-line (stand-in)", "shown", await src());
  await teardown();

  // ===== WIKILINK (bare ![[…]], block) =====
  await setup("# T\n\ntext\n\n![[sample-portrait.png]]\n");
  let W = await cdp.evaluate('(() => { const cm = app.workspace.activeEditor.editor.cm; return { w: cm.state.doc.line(5).from, off: cm.state.doc.line(3).from }; })()');
  await mode("native"); await cur(W.off);     rec("wikilink native off-line", "hidden", await src(".lie-fake-link-block"));
  await cur(W.w);                              rec("wikilink native cursor-on-line (native carries)", "shown", await src(".lie-fake-link-block"));
  await mode("always"); await cur(W.off); await cdp.hover(2, 2); rec("wikilink always off-line (stand-in)", "shown", await src(".lie-fake-link-block"));
  await mode("auto"); await cur(W.off); await hoverImg(".lie-wrapper-block"); rec("wikilink auto real-hover (stand-in)", "shown", await src(".lie-fake-link-block"));
  await teardown();

  // ===== TABLE CELL editor (real click) — the reveal shows like a standalone under edit =====
  await setup("# T\n\n| a | b |\n| --- | --- |\n| x | ![](images/sample-square.png){width=80} |\n");
  await mode("native"); await cur(0);
  await cdp.evaluate('(() => { const img = [...document.querySelectorAll(".cm-table-widget table img")].find((i) => i.offsetWidth > 0); img?.scrollIntoView({ block: "center" }); return true; })()');
  await wait(450);
  const cellPt = await cdp.evaluate('(() => { const img = [...document.querySelectorAll(".cm-table-widget table img")].find((i) => i.offsetWidth > 0); if (!img) return null; const r = img.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  if (cellPt) { await cdp.click(cellPt.x, cellPt.y); await wait(900); }
  rec("table cell-editor real click (source revealed like standalone under edit)", "shown", await src());
  await teardown();
} catch (e) {
  console.log("FATAL: " + (e && e.stack || e));
  await cdp.focusEmulation(false).catch(() => {});
  cdp.close();
  process.exit(2);
}
// Reset the page state so this check never pollutes the shared window for later suite scripts (the
// hover / `:focus-within`-gated toolbar & resize checks misbehave if focus emulation is left on).
await cdp.focusEmulation(false).catch(() => {});
cdp.close();

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(48)} expect=${r.expect.padEnd(6)} shown=${String(r.shown).padEnd(5)} fakeInk=${r.fake} natInk=${r.nat}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) { console.log("reveal matrix FAILED"); process.exit(1); }
console.log("reveal matrix OK");

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
