#!/usr/bin/env node
// TABLE-HOST GUARD — the full variant matrix for image embeds in table cells and standalone
// control lines, plus the exact size-modal→normalize user journey. Catches the dead-cell class:
// a static cell copy left CSS-suppressed without its replacement (image gone / raw {…} shown)
// after interaction or a normalize rewrite.
//
// Coverage map (which branch covers which variant):
//   KERN pass (vault link format = md): {wiki, md} × {plain, native size, {…} block, size+block}
//     × {LP static, real click into cell (cell editor), cursor back out, Reading} × {cell, standalone}.
//     Includes one quoted-brace block and eight real cell click-in/out cycles.
//   LINKFORMAT pass: the same fixture under useMarkdownLinks=false (wiki vault) — reduced to
//     static + one representative cell cycle (the conversion-richest md size+block cell), because
//     the per-cell mechanics are format-agnostic and fully crossed in KERN.
//   REVEAL passes: defaultRevealState auto/always over the static state only — the reveal model is
//     the LP widget's; table cells never show raw text in any mode, standalone stand-ins are
//     EXPECTED visible in `always`. (native is KERN's default.)
//   CAPTION passes: showCaptions on/off, LP static + Reading — the real caption text must appear
//     under the captioned embed when on, never the filename, and nothing when off.
//   JOURNEY: changed, no-op and stability commits for solo and exact table targets under both
//     link formats.
//   INSTRUMENTATION: passive tagged writes and source stability; table-format comparison
//     canonicalizes Obsidian's cell padding and delimiter widths.
//   After every pass: the fixture on disk parses, every target resolves, sizes/blocks are
//     semantically preserved (canonical folding allowed), table rows keep their cell count.
//   Console errors/unhandled rejections during the run: must be zero.
//
// Prereqs (CLAUDE.md → Live debugging): dev build in vault-image-toolbar/ + Obsidian with CDP.
//   node tests/cdp/verify-table-host.mjs   (CDP_PORT defaults 9223, target vault-image-toolbar)
import { connectOptical } from "./_optical.mjs";

const FIXTURE = "zz-guard-tables.md";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

// 8 variants: [label, table-cell embed (pipes table-escaped), standalone embed]
const VARIANTS = [
  ["wiki plain",      "![[sample-landscape.png]]",                      "![[sample-landscape.png]]"],
  ["wiki size",       "![[sample-portrait.png\\|90]]",                  "![[sample-portrait.png|90]]"],
  ["wiki quoted block", "![[sample-square.png]]{width=90 style=\"--guard: before}quoted-tail\"}", "![[sample-square.png]]{width=90 style=\"--guard: before}quoted-tail\"}"],
  ["wiki size+block", "![[sample-landscape.png\\|90]]{rotate=90}",      "![[sample-landscape.png|90]]{rotate=90}"],
  ["md plain",        "![](images/sample-portrait.png)",                "![](images/sample-portrait.png)"],
  ["md size",         "![\\|90](images/sample-square.png)",             "![|90](images/sample-square.png)"],
  ["md block",        "![](images/sample-landscape.png){width=90}",     "![](images/sample-landscape.png){width=90}"],
  ["md size+block",   "![\\|90](images/sample-portrait.png){rotate=90}","![|90](images/sample-portrait.png){rotate=90}"],
];
const SOLO_LINES = []; // 0-based line numbers of the standalone embeds, filled by fixtureContent()
const TABLE_ROW_LINES = []; // 0-based source lines of the table variants
const CAPTION_LINE = { n: 0 };
const QUOTED_VARIANT_INDEX = 2;

function fixtureContent() {
  SOLO_LINES.length = 0;
  TABLE_ROW_LINES.length = 0;
  const lines = ["# zz table-host guard", "", "Standalone control lines:", ""];
  CAPTION_LINE.n = lines.length;
  lines.push('![[sample-square.png|"Guard caption"]]', "");
  for (const [, , solo] of VARIANTS) { SOLO_LINES.push(lines.length); lines.push(solo, ""); }
  lines.push("| Case | Image | Text |", "| --- | --- | --- |");
  for (const [label, cell] of VARIANTS) { TABLE_ROW_LINES.push(lines.length); lines.push(`| ${label} | ${cell} | filler |`); }
  lines.push("", "Outro paragraph for parking the cursor and clicking out.", "");
  return lines.join("\n");
}

// The REAL markdown table (LP table widget or reading view) — never plugin-chrome tables
// (e.g. another plugin's color-picker table also lives inside the view).
const TABLE_SEL = ".workspace-leaf.mod-active .cm-table-widget table, .workspace-leaf.mod-active .markdown-reading-view table, .workspace-leaf.mod-active .markdown-preview-view table";

const cdp = await connectOptical();
let orig = null;
try {
  await cdp.focusEmulation(true);
  if (await cdp.evaluate("app.vault.getName()") !== "vault-image-toolbar") { console.log("FATAL: wrong vault"); process.exit(2); }

  const runtimeFingerprint = await cdp.evaluate(`(() => {
    const p = app.plugins.plugins["live-image-editor"];
    const source = (value) => typeof value === "function" ? Function.prototype.toString.call(value) : "";
    const strip = source(p?.stripBlockText);
    const pair = source(p?.pairLivePreviewBlock);
    const locate = source(p?.locateImage);
    return {
      methods: !!p?.postProcessorLocations
        && typeof p.pairLivePreviewBlock === "function"
        && typeof p.cachedPostProcessorLocation === "function"
        && typeof p.parseLocationsInRange === "function",
      centralScanner: strip.includes("scanAttributeBlock") && !strip.includes("[^}]"),
      boundedPairing: pair.includes("posAtDOM")
        && pair.includes("parseLocationsInRange")
        && pair.includes("pairImageLocations"),
      noGlobalFallback: locate.includes("isPostProcessorImage")
        && locate.includes("widgetLocation")
        && !locate.includes("findImageInSource")
        && !locate.includes("findImageInText"),
    };
  })()`);
  if (!Object.values(runtimeFingerprint).every(Boolean)) {
    console.log("FATAL: stale/incompatible plugin runtime " + JSON.stringify(runtimeFingerprint));
    await cdp.focusEmulation(false);
    cdp.close();
    process.exit(2);
  }

  orig = await cdp.evaluate(`(() => {
    const p = app.plugins.plugins["live-image-editor"];
    window.__thErrors = [];
    window.addEventListener("error", (e) => window.__thErrors.push(String(e.message)));
    window.addEventListener("unhandledrejection", (e) => window.__thErrors.push("rej:" + String(e.reason)));
    return { useMd: !!app.vault.getConfig("useMarkdownLinks"), reveal: p.settings.defaultRevealState, captions: p.settings.showCaptions };
  })()`);

  // ---- shared drivers -------------------------------------------------------------------------
  const setLinkFormat = async (useMd) => { await cdp.evaluate(`app.vault.setConfig("useMarkdownLinks", ${useMd})`); };
  const setReveal = async (m) => { await cdp.evaluate(`(() => { const p = app.plugins.plugins["live-image-editor"]; p.settings.defaultRevealState = ${JSON.stringify(m)}; p.refreshLivePreviewDecorations(); })()`); await wait(300); };
  const setCaptions = async (on) => { await cdp.evaluate(`(() => { const p = app.plugins.plugins["live-image-editor"]; p.settings.showCaptions = ${on}; p.refreshLivePreviewDecorations(); })()`); await wait(300); };
  const readFixture = () => cdp.evaluate(`app.vault.adapter.read(${JSON.stringify(FIXTURE)})`);
  const readFixtureState = () => cdp.evaluate(`(async () => {
    const file = app.workspace.getActiveFile();
    const editor = app.workspace.activeEditor?.editor;
    const disk = await app.vault.adapter.read(${JSON.stringify(FIXTURE)});
    const state = app.workspace.getLeaf(false).getViewState().state;
    return {
      file: file?.path ?? null,
      buffer: editor?.getValue() ?? null,
      disk,
      sourceMode: state.mode === "source" && state.source !== true,
    };
  })()`);
  const settleFixture = async (expected = null, label = "fixture") => {
    let state = null;
    for (let i = 0; i < 24; i++) {
      state = await readFixtureState();
      if (state.file === FIXTURE && state.sourceMode && state.buffer === state.disk
        && (expected === null || state.buffer === expected)) return state;
      await wait(250);
    }
    throw new Error(`${label} buffer did not settle: ${JSON.stringify({
      file: state?.file, sourceMode: state?.sourceMode,
      bufferMatchesDisk: state?.buffer === state?.disk,
      bufferMatchesExpected: expected === null || state?.buffer === expected,
    })}`);
  };
  const normalizeObsidianTableFormatting = (source) => source.split("\n").map((line) => {
    if (!/^\s{0,3}\|/.test(line)) return line;
    const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
    const inner = cells.slice(1, -1);
    const isDelimiter = inner.length > 0 && inner.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (isDelimiter) {
      for (let index = 1; index < cells.length - 1; index++) {
        cells[index] = cells[index].replace(/-+/, "---");
      }
    }
    return cells.join("|");
  }).join("\n");
  const sourceDiffDetail = (before, after) => {
    const rawBefore = before.split("\n");
    const rawAfter = after.split("\n");
    const normalizedBefore = normalizeObsidianTableFormatting(before).split("\n");
    const normalizedAfter = normalizeObsidianTableFormatting(after).split("\n");
    const raw = [];
    const normalized = [];
    const length = Math.max(rawBefore.length, rawAfter.length);
    for (let index = 0; index < length; index++) {
      if (rawBefore[index] !== rawAfter[index]) {
        raw.push(`${index + 1}:${JSON.stringify(rawBefore[index] ?? null)}→${JSON.stringify(rawAfter[index] ?? null)}`);
      }
      if (normalizedBefore[index] !== normalizedAfter[index]) {
        normalized.push(`${index + 1}:${JSON.stringify(normalizedBefore[index] ?? null)}→${JSON.stringify(normalizedAfter[index] ?? null)}`);
      }
    }
    return `raw=[${raw.join("; ")}] normalized=[${normalized.join("; ")}]`;
  };
  const armPluginWriteProbe = () => cdp.evaluate(`(() => {
    const cm = app.workspace.activeEditor?.editor?.cm;
    if (!cm || typeof cm.dispatchTransactions !== "function" || window.__thDispatchGuard) return false;
    const descriptor = Object.getOwnPropertyDescriptor(cm, "dispatchTransactions");
    const original = cm.dispatchTransactions;
    window.__thPluginWrites = 0;
    Object.defineProperty(cm, "dispatchTransactions", {
      configurable: true,
      writable: true,
      value: function (transactions, view) {
        for (const transaction of transactions) {
          if (transaction.isUserEvent("lie.transform")) window.__thPluginWrites++;
        }
        return original.call(cm, transactions, view);
      },
    });
    window.__thDispatchGuard = { cm, descriptor };
    return true;
  })()`);
  const disarmPluginWriteProbe = () => cdp.evaluate(`(() => {
    const guard = window.__thDispatchGuard;
    if (!guard) return null;
    if (guard.descriptor) Object.defineProperty(guard.cm, "dispatchTransactions", guard.descriptor);
    else delete guard.cm.dispatchTransactions;
    window.__thDispatchGuard = null;
    return window.__thPluginWrites;
  })()`);


  const openFixture = async (content) => {
    await cdp.evaluate(`(async () => {
      const v = app.vault;
      let f = v.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
      if (f) await v.modify(f, ${JSON.stringify(content)}); else f = await v.create(${JSON.stringify(FIXTURE)}, ${JSON.stringify(content)});
      const l = app.workspace.getLeaf(false);
      await l.openFile(f, { active: true });
      const st = l.getViewState(); st.state.mode = "source"; st.state.source = false; await l.setViewState(st);
    })()`);
    await settleFixture(content, "openFixture");
    await wait(600); // the source is settled; allow only the render projection to finish
  };
  const setMode = async (mode) => {
    await cdp.evaluate(`(async () => { const l = app.workspace.activeLeaf; const st = l.getViewState(); st.state.mode = ${JSON.stringify(mode)}; await l.setViewState(st); })()`);
    await wait(1300);
  };
  // Viewport move via a CM transaction, then the cursor back to 0 without scroll.
  const scrollToLine = async (n) => {
    await cdp.evaluate(`(() => { const cm = app.workspace.activeEditor?.editor?.cm; if (!cm) return false;
      const pos = cm.state.doc.line(Math.min(${n} + 1, cm.state.doc.lines)).from;
      cm.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      return true; })()`);
    await wait(350);
    await cdp.evaluate(`(() => { const cm = app.workspace.activeEditor?.editor?.cm; if (cm) cm.dispatch({ selection: { anchor: 0 } }); return true; })()`);
    await wait(350);
  };
  const scrollToTable = async () => {
    // The LP table widget only exists for the rendered viewport — scroll its line range first.
    const inLp = await cdp.evaluate(`!!app.workspace.activeEditor?.editor?.cm`);
    if (inLp) await scrollToLine(TABLE_ROW_LINES[0]);
    await cdp.evaluate(`(() => { document.querySelector(${JSON.stringify(TABLE_SEL)})?.scrollIntoView({ block: "center" }); return true; })()`);
    await wait(600);
  };
  const cursorOut = async () => {
    await cdp.evaluate(`(() => { const cm = app.workspace.activeEditor?.editor?.cm; if (cm) { cm.dispatch({ selection: { anchor: 0 } }); cm.focus(); } return true; })()`);
    await cdp.hover(4, 4);
    await wait(900);
  };
  const clickOutro = async () => {
    const outroPt = () => cdp.evaluate(`(() => {
      const root = document.querySelector(".workspace-leaf.mod-active .cm-content");
      const el = [...root.querySelectorAll(".cm-line")].find((l) => l.textContent.startsWith("Outro paragraph"));
      if (!el) return null; const r = el.getBoundingClientRect();
      if (r.y < 60 || r.y > window.innerHeight - 10) return null;
      return { x: r.x + 20, y: r.y + r.height / 2 };
    })()`);
    let pt = await outroPt();
    if (pt) await cdp.click(pt.x, pt.y);
    await wait(900);
    await cursorOut();
    // Lingering cell editor: a real Escape + one grace re-click, then the state stands.
    if (await cdp.evaluate(`(() => { const ce = document.querySelector(".workspace-leaf.mod-active table .cm-editor"); return !!(ce && ce.offsetWidth > 0); })()`)) {
      await cdp.press("Escape");
      await wait(500);
      pt = await outroPt();
      if (pt) await cdp.click(pt.x, pt.y);
      await wait(900);
      await cursorOut();
    }
  };
  const openJourneySizeModal = async (place, targetLine, cellIndex) => {
    if (place === "solo") await scrollToLine(targetLine);
    else await scrollToTable();
    return cdp.evaluate(`(() => {
      const p = app.plugins.plugins["live-image-editor"];
      let img = null;
      if (${JSON.stringify(place)} === "solo") {
        const cm = app.workspace.activeEditor.editor.cm;
        const hit = [...document.querySelectorAll(".workspace-leaf.mod-active .cm-content .lie-wrapper")].find((w) => {
          try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === ${targetLine + 1}; }
          catch (e) { return false; }
        });
        img = hit && hit.querySelector("img");
      } else {
        const t = [...document.querySelectorAll(${JSON.stringify(TABLE_SEL)})].find((x) => x.offsetWidth > 0);
        const rows = t ? [...t.querySelectorAll("tr")].filter((tr) => tr.querySelector("td")) : [];
        const td = rows[${cellIndex}]?.children[1];
        img = td && [...td.querySelectorAll("img")].find((i) => i.offsetWidth > 0);
      }
      if (!img) return "no-img";
      p.activeImage = img;
      p.customSize();
      return !!document.querySelector(".lie-submenu");
    })()`);
  };

  // Table cells' visible state (scoped to the VISIBLE real table — in Reading mode the LP table
  // still exists behind a hidden source view; open cell editors flagged, not judged).
  const probeCells = () => cdp.evaluate(`(() => {
    const t = [...document.querySelectorAll(${JSON.stringify(TABLE_SEL)})].find((x) => x.offsetWidth > 0);
    if (!t) return { cells: [], cellEditorOpen: false, noTable: true };
    const ce = t.querySelector(".cm-editor");
    const cellEditorOpen = !!(ce && ce.offsetWidth > 0);
    const cells = [...t.querySelectorAll("tr")].filter((tr) => tr.querySelector("td")).map((tr) => {
      const td = tr.children[1];
      if (!td) return null;
      const inEditor = !!td.querySelector(".cm-editor");
      const visImgs = [...td.querySelectorAll("img")].filter((i) => i.offsetWidth > 0 && !i.classList.contains("cm-widgetBuffer")).length;
      const raw = /\\{[^}]*\\}|!\\[|quoted-tail/.test(td.innerText || "");
      return { label: (tr.children[0]?.innerText || "").trim(), visImgs, raw, inEditor };
    }).filter(Boolean);
    return { cells, cellEditorOpen };
  })()`);

  // Per-line standalone probe: scroll each solo line into view (CM renders the viewport only).
  const probeSolos = async () => {
    const out = [];
    for (const n of SOLO_LINES) {
      await scrollToLine(n);
      out.push(await cdp.evaluate(`(() => {
        const cm = app.workspace.activeEditor.editor.cm;
        const pos = cm.state.doc.line(${n + 1}).from;
        let host = null;
        try { const d = cm.domAtPos(pos); host = (d.node.nodeType === 1 ? d.node : d.node.parentElement).closest(".cm-line"); } catch (e) {}
        let wrap = host && host.querySelector(".lie-wrapper");
        if (!wrap) { // a bare embed renders as a block widget next to (not inside) its line
          wrap = [...document.querySelectorAll(".workspace-leaf.mod-active .cm-content .lie-wrapper")].find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === ${n + 1}; } catch (e) { return false; } });
        }
        const img = wrap && wrap.querySelector(".lie-box img, img");
        const raw = host ? /\\{[^}]*\\}|!\\[\\[|!\\[\\]|quoted-tail/.test(host.innerText || "") : false;
        return { line: ${n}, imgW: img ? img.offsetWidth : 0, raw };
      })()`));
    }
    return out;
  };

  // Disk validation: parse + resolve every embed, check semantic preservation and row integrity.
  const checkDisk = async (passName) => {
    const d = await cdp.evaluate(`(async () => {
      const raw = await app.vault.adapter.read(${JSON.stringify(FIXTURE)});
      const embeds = []; const rows = [];
      for (const line of raw.split("\\n")) {
        const isRow = /^\\s{0,3}\\|/.test(line);
        for (const m of line.matchAll(/!\\[\\[([^\\]]+)\\]\\]|!\\[[^\\]]*\\]\\(([^()]*(?:\\([^()]*\\)[^()]*)*)\\)/g)) {
          const path = m[1] ? m[1].replace(/\\\\\\|/g, "|").split("|")[0] : (m[2] || "").split(" ")[0];
          let dec = path; try { dec = decodeURIComponent(path); } catch (e) {}
          const resolved = app.metadataCache.getFirstLinkpathDest(dec.split(/[#^]/)[0], ${JSON.stringify(FIXTURE)});
          embeds.push({ target: resolved ? resolved.path : null, text: m[0].slice(0, 40) });
        }
        if (isRow && !/^\\s*\\|[\\s|:-]*\\|\\s*$/.test(line) && line.includes("!"))
          rows.push(line.split(/(?<!\\\\)\\|/).slice(1, -1).length);
      }
      return { embeds, rows, raw };
    })()`);
    rec(`${passName}: disk — every embed target resolves`, d.embeds.length >= 17 && d.embeds.every((e) => e.target), `(${d.embeds.length} embeds, unresolved: ${d.embeds.filter((e) => !e.target).map((e) => e.text).join(",") || "none"})`);
    rec(`${passName}: disk — table rows keep 3 columns`, d.rows.length === 8 && d.rows.every((c) => c === 3), d.rows.join(","));
    const with90 = d.raw.split("\n").filter((l) => /90/.test(l) && /!\[/.test(l)).length;
    rec(`${passName}: disk — size 90 survives on its lines`, with90 >= 10, `(${with90} lines)`);
    const withRotate = d.raw.split("\n").filter((l) => /rotate=90/.test(l)).length;
    rec(`${passName}: disk — foreign block keys survive`, withRotate === 4, `(${withRotate} rotate lines)`);
  };

  const assertStatic = async (passName, { expectSoloRaw = false } = {}) => {
    const solos = await probeSolos();
    rec(`${passName}: static — all 8 standalone images render`, solos.every((s) => s.imgW > 0), `(${solos.map((s) => s.imgW).join(",")})`);
    if (!expectSoloRaw) rec(`${passName}: static — no raw source on standalone lines`, solos.every((s) => !s.raw), solos.filter((s) => s.raw).map((s) => s.line).join(","));
    else rec(`${passName}: static — standalone stand-in visible (designed)`, solos.some((s) => s.raw), "");
    await scrollToTable();
    const p = await probeCells();
    rec(`${passName}: static — every image cell shows exactly 1 image`, p.cells.length === 8 && p.cells.every((c) => c.inEditor || c.visImgs === 1), `(${p.cells.map((c) => c.inEditor ? "E" : c.visImgs).join("")})`);
    rec(`${passName}: static — no raw {…}/link text in any cell`, p.cells.every((c) => c.inEditor || !c.raw), p.cells.filter((c) => !c.inEditor && c.raw).map((c) => c.label).join(","));
    return { solos, cells: p.cells };
  };

  const cellCycle = async (passName, idx) => {
    // Render the table region, then walk the scroller until the target image is on-screen.
    await scrollToLine(CAPTION_LINE.n);
    let pt = null;
    for (let m = 0; m < 12 && !pt; m++) {
      pt = await cdp.evaluate(`(() => {
        const sc = document.querySelector(".workspace-leaf.mod-active .cm-scroller");
        const t = [...document.querySelectorAll(${JSON.stringify(TABLE_SEL)})].find((x) => x.offsetWidth > 0);
        const rows = t ? [...t.querySelectorAll("tr")].filter((tr) => tr.querySelector("td")) : [];
        const td = rows[${idx}]?.children[1];
        const img = td && [...td.querySelectorAll("img")].find((i) => i.offsetWidth > 0);
        if (!img) {
          if (sc) sc.scrollTop += Math.max(150, window.innerHeight / 2);
          return null;
        }
        const r = img.getBoundingClientRect();
        // Clamp into the viewport while staying on the image; the point must hit-test the cell.
        const x = Math.max(r.x + 8, Math.min(r.x + r.width / 2, window.innerWidth - 30));
        const y = Math.max(r.y + 8, Math.min(r.y + r.height / 2, window.innerHeight - 55));
        const hit = document.elementFromPoint(x, y);
        if (y < 60 || y > r.y + r.height - 4 || x > r.x + r.width - 4 || x < 0 || !hit || !td.contains(hit)) {
          if (sc) sc.scrollTop += (r.y + Math.min(r.height, 120) / 2 - window.innerHeight / 2);
          return null;
        }
        return { x, y };
      })()`);
      if (!pt) await wait(400);
    }
    if (!pt) {
      const d = await cdp.evaluate(`(() => {
        const sc = document.querySelector(".workspace-leaf.mod-active .cm-scroller");
        const t = [...document.querySelectorAll(${JSON.stringify(TABLE_SEL)})].find((x) => x.offsetWidth > 0);
        const rows = t ? [...t.querySelectorAll("tr")].filter((tr) => tr.querySelector("td")) : [];
        const td = rows[${idx}]?.children[1];
        return { rows: rows.length, tdImgs: td ? [...td.querySelectorAll("img")].map((i) => i.offsetWidth) : null,
          scTop: sc ? Math.round(sc.scrollTop) : null, scMax: sc ? Math.round(sc.scrollHeight) : null, ih: window.innerHeight };
      })()`);
      rec(`${passName}: cell ${idx} (${VARIANTS[idx][0]}) — clickable image present (on-screen)`, false, JSON.stringify(d));
      return;
    }
    // Engagement = Obsidian's cell editor (md cells; raw source there is the EXPECTED reveal)
    // or the plugin's click-toolbar (wiki embeds are atomic). One retry.
    let pIn = null, toolbarUp = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      await cdp.click(pt.x, pt.y);
      await wait(900);
      pIn = await probeCells();
      toolbarUp = await cdp.evaluate(`!!document.querySelector(".lie-toolbar-floating, .lie-toolbar-in-image")`);
      if (pIn.cellEditorOpen || toolbarUp) break;
      await cdp.hover(4, 4);
      await wait(500);
    }
    let diag = "";
    if (!pIn.cellEditorOpen && !toolbarUp) {
      diag = await cdp.evaluate(`(() => { const e = document.elementFromPoint(${pt.x}, ${pt.y}); return " topEl=" + (e ? e.tagName + "." + String(e.className).slice(0, 60) : "null"); })()`);
    }
    rec(`${passName}: cell ${idx} (${VARIANTS[idx][0]}) — real click engages (cell editor with EXPECTED reveal, or the click-toolbar)`, pIn.cellEditorOpen || toolbarUp, `(editor=${pIn.cellEditorOpen} toolbar=${toolbarUp})${diag}`);
    await clickOutro();
    const pOut = await probeCells();
    rec(`${passName}: cell ${idx} (${VARIANTS[idx][0]}) — after cursor-out the cell shows its image again, no raw text`,
      !pOut.cellEditorOpen && pOut.cells[idx] && pOut.cells[idx].visImgs === 1 && !pOut.cells[idx].raw,
      JSON.stringify(pOut.cells[idx] || null) + (pOut.cellEditorOpen ? " [cell editor lingers]" : ""));
  };

  // ================================ KERN pass (md vault) ========================================
  await setLinkFormat(true);
  await setReveal("native");
  await setCaptions(false);
  await openFixture(fixtureContent());
  await cursorOut();
  const kernPassiveBefore = await settleFixture();
  if (await armPluginWriteProbe() !== true) throw new Error("could not arm lie.transform write probe");
  const kernStatic = await assertStatic("KERN");
  rec("KERN: LP static — quoted-brace block leaves no visible remainder",
    !!kernStatic.cells[QUOTED_VARIANT_INDEX] && !kernStatic.cells[QUOTED_VARIANT_INDEX].raw,
    JSON.stringify(kernStatic.cells[QUOTED_VARIANT_INDEX] || null));
  await setMode("preview");
  await scrollToTable();
  const pRead = await probeCells();
  rec("KERN: Reading — every image cell shows exactly 1 image", pRead.cells.length === 8 && pRead.cells.every((c) => c.visImgs === 1), `(${pRead.cells.map((c) => c.visImgs).join("")})`);
  rec("KERN: Reading — no raw {…}/link text in any cell", pRead.cells.every((c) => !c.raw), "");
  rec("KERN: Reading — quoted-brace block leaves no visible remainder",
    !!pRead.cells[QUOTED_VARIANT_INDEX] && !pRead.cells[QUOTED_VARIANT_INDEX].raw,
    JSON.stringify(pRead.cells[QUOTED_VARIANT_INDEX] || null));
  await setMode("source");
  await cursorOut();
  const kernPassiveAfter = await settleFixture();
  const kernPassivePluginWrites = await disarmPluginWriteProbe();
  rec("KERN: passive LP + Reading emit zero plugin lie.transform source writes",
    kernPassivePluginWrites === 0, `(${kernPassivePluginWrites})`);
  const kernPassiveBufferSame = normalizeObsidianTableFormatting(kernPassiveAfter.buffer) === normalizeObsidianTableFormatting(kernPassiveBefore.buffer);
  const kernPassiveDiskSame = normalizeObsidianTableFormatting(kernPassiveAfter.disk) === normalizeObsidianTableFormatting(kernPassiveBefore.disk);
  rec("KERN: passive LP + Reading preserve source modulo Obsidian table formatting",
    kernPassiveBufferSame && kernPassiveDiskSame,
    kernPassiveBufferSame && kernPassiveDiskSame ? "" : `buffer ${sourceDiffDetail(kernPassiveBefore.buffer, kernPassiveAfter.buffer)} disk ${sourceDiffDetail(kernPassiveBefore.disk, kernPassiveAfter.disk)}`);

  await openFixture(fixtureContent());
  await cursorOut();
  const kernCellsBefore = await settleFixture();
  if (await armPluginWriteProbe() !== true) throw new Error("could not arm lie.transform write probe");
  for (let i = 0; i < 8; i++) await cellCycle("KERN", i);
  const kernPluginWrites = await disarmPluginWriteProbe();
  const kernCellsAfter = await settleFixture(null, "KERN cell cycles");
  rec("KERN: cell-editor cycles emit zero plugin lie.transform source writes",
    kernPluginWrites === 0, `(${kernPluginWrites})`);
  const kernBufferSame = normalizeObsidianTableFormatting(kernCellsAfter.buffer) === normalizeObsidianTableFormatting(kernCellsBefore.buffer);
  const kernDiskSame = normalizeObsidianTableFormatting(kernCellsAfter.disk) === normalizeObsidianTableFormatting(kernCellsBefore.disk);
  rec("KERN: cell-editor cycles preserve source modulo Obsidian table formatting",
    kernBufferSame && kernDiskSame,
    kernBufferSame && kernDiskSame ? "" : `buffer ${sourceDiffDetail(kernCellsBefore.buffer, kernCellsAfter.buffer)} disk ${sourceDiffDetail(kernCellsBefore.disk, kernCellsAfter.disk)}`);
  await checkDisk("KERN");

  // ============================ LINKFORMAT pass (wiki vault) ====================================
  await setLinkFormat(false);
  await openFixture(fixtureContent());
  await cursorOut();
  await assertStatic("WIKI");
  await cellCycle("WIKI", 7); // md size+block — the conversion-richest cell
  await checkDisk("WIKI");
  await setLinkFormat(true);

  // ================================ REVEAL passes ===============================================
  await openFixture(fixtureContent());
  for (const m of ["auto", "always"]) {
    await setReveal(m);
    await cursorOut();
    await assertStatic(`REVEAL:${m}`, { expectSoloRaw: m === "always" });
  }
  await setReveal("native");

  // ================================ CAPTION passes ==============================================
  await setCaptions(true);
  await openFixture(fixtureContent());
  await cursorOut();
  await scrollToLine(CAPTION_LINE.n);
  const capQ = `(() => [...document.querySelectorAll(".workspace-leaf.mod-active .lie-caption")].filter((c) => c.offsetWidth > 0).map((c) => (c.innerText || "").trim()))()`;
  // The caption markdown renders async inside the widget — poll briefly (part of this render op).
  const capsSettled = async () => {
    for (let i = 0; i < 6; i++) { const c = await cdp.evaluate(capQ); if (c.length) return c; await wait(700); }
    return cdp.evaluate(capQ);
  };
  let caps = await capsSettled();
  const capDiag = caps.length ? "" : await cdp.evaluate(`(() => {
    const cm = app.workspace.activeEditor?.editor?.cm; if (!cm) return " no-cm";
    const n = ${CAPTION_LINE.n} + 1;
    const wraps = [...document.querySelectorAll(".workspace-leaf.mod-active .cm-content .lie-wrapper")].map((w) => { let ln = -1; try { ln = cm.state.doc.lineAt(cm.posAtDOM(w)).number; } catch (e) {} return ln; });
    const p = app.plugins.plugins["live-image-editor"];
    const st = app.workspace.activeLeaf.getViewState();
    const srcVis = document.querySelector(".workspace-leaf.mod-active .markdown-source-view")?.offsetWidth > 0;
    return " line=" + JSON.stringify(cm.state.doc.line(n).text.slice(0, 45)) + " wrapLines=" + JSON.stringify(wraps) + " showCaptions=" + p.settings.showCaptions + " mode=" + st.state.mode + " srcVis=" + srcVis;
  })()`);
  rec("CAPTION:on — the real caption text renders", caps.some((t) => t.includes("Guard caption")), JSON.stringify(caps) + capDiag);
  rec("CAPTION:on — the filename never renders as a caption", caps.every((t) => !/sample-|\.png/.test(t)), JSON.stringify(caps));
  await setMode("preview");
  const readingScroll = await cdp.evaluate(`(() => {
    const scroller = [...document.querySelectorAll(".workspace-leaf.mod-active .markdown-preview-view")]
      .find((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
    if (!scroller) return { found: false };
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll"));
    return {
      found: true,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    };
  })()`);
  await wait(900);
  caps = await capsSettled();
  rec("CAPTION:on Reading — the real caption text renders",
    caps.some((t) => t.includes("Guard caption")),
    JSON.stringify(caps) + (caps.length ? "" : ` scroller=${JSON.stringify(readingScroll)}`));
  rec("CAPTION:on Reading — the filename never renders as a caption", caps.every((t) => !/sample-|\.png/.test(t)), "");
  await setMode("source");
  await setCaptions(false);
  // A real render op (mode round-trip) — Obsidian re-uses embed DOM across views, and only a
  // render re-evaluates a re-used copy (a stale caption riding one is otherwise unreachable).
  await setMode("preview");
  await setMode("source");
  await cursorOut();
  await scrollToLine(CAPTION_LINE.n);
  // Poll until the rebuild removed every caption (mode switch + decoration rebuild settle).
  for (let i = 0; i < 6; i++) { caps = await cdp.evaluate(capQ); if (!caps.length) break; await wait(700); }
  let offDiag = "";
  if (caps.length) {
    offDiag = await cdp.evaluate(`(() => [...document.querySelectorAll(".workspace-leaf.mod-active .lie-caption")].filter((c) => c.offsetWidth > 0).map((c) => {
      const host = c.closest(".markdown-reading-view, .markdown-preview-view, .markdown-source-view, .lie-wrapper");
      return (host ? host.className.split(" ").slice(0, 2).join(".") : "?") + ">" + (c.parentElement ? c.parentElement.className.slice(0, 40) : "?");
    }).join(" | "))()`);
  }
  rec("CAPTION:off — no caption rendered", caps.length === 0, JSON.stringify(caps) + " " + offDiag);

  // ================================ JOURNEY (both formats) ======================================
  const journey = async (useMd, place, cellIndex = -1) => {
    const name = `JOURNEY:${useMd ? "md" : "wiki"}:${place}${cellIndex >= 0 ? `:${cellIndex}-${VARIANTS[cellIndex][0]}` : ""}`;
    await setLinkFormat(useMd);
    await openFixture(fixtureContent());
    let targetLine = -1;
    if (place === "solo") {
      // step 1: reset the target line to the raw wiki native-size form (the user's typing)
      targetLine = await cdp.evaluate(`(() => {
        const ed = app.workspace.activeEditor.editor;
        const n = ${SOLO_LINES[1]};
        ed.setLine(n, "![[sample-landscape.png|90]]");
        ed.setCursor({ line: n, ch: 2 });
        return n;
      })()`);
      await scrollToLine(targetLine);
      await wait(900);
    } else {
      targetLine = TABLE_ROW_LINES[cellIndex];
      await scrollToTable();
    }
    const sourceBefore = await cdp.evaluate(`app.workspace.activeEditor.editor.getValue().split("\\n")`);
    const targetLabel = place === "cell" ? VARIANTS[cellIndex][0] : "";
    const targetRowLabel = place === "cell"
      ? (sourceBefore[targetLine]?.match(/^\s{0,3}\|\s*([^|]*?)\s*\|/)?.[1]?.trim() ?? "")
      : "";
    const sameFileLines = sourceBefore.map((line, index) => ({ line, index })).filter(({ line }) => line.includes("sample-landscape.png"));
    if (place === "cell") {
      rec(`${name} — exact target row is resolved before the edit`,
        targetLine >= 0 && targetRowLabel === targetLabel && sameFileLines.length >= 3,
        `line=${targetLine} label=${JSON.stringify(targetRowLabel)} same-file=${sameFileLines.map(({ index }) => index).join(",")}`);
    }
    // step 2+3: size modal on the target image, commit 120 (real input + real ✓ click)
    const opened = await openJourneySizeModal(place, targetLine, cellIndex);
    if (opened !== true) { rec(`${name} — size modal opens`, false, String(opened)); return; }
    // arm the write instrumentation: every editor-change from here on is counted
    await cdp.evaluate(`(() => { window.__thEdits = 0; window.__thEditsRef = app.workspace.on("editor-change", () => window.__thEdits++); return true; })()`);
    // Commit a REAL change (120 ≠ the current 90) — an unchanged commit writes nothing (F0).
    await cdp.evaluate(`(() => {
      const wIn = document.querySelectorAll(".lie-submenu input")[0];
      if (wIn) { wIn.focus(); wIn.value = "120"; wIn.dispatchEvent(new Event("input", { bubbles: true })); }
      document.querySelector(".lie-submenu-confirm")?.click();
      return true;
    })()`);
    await wait(700);
    // the commit must produce the canonical line IMMEDIATELY — one write (F5/F6)
    const sourceAfterCommit = await cdp.evaluate(`app.workspace.activeEditor.editor.getValue().split("\\n")`);
    const lineNow = sourceAfterCommit[targetLine] ?? null;
    const canonical = useMd ? /!\[\]\([^)]*sample-landscape\.png\)\{width=120\}/ : /!\[\[sample-landscape\.png\]\]\{width=120\}/;
    let commitDiag = "";
    if (!lineNow || !canonical.test(lineNow)) {
      commitDiag = await cdp.evaluate(`(() => { const ed = app.workspace.activeEditor.editor; const out = []; for (let i = 0; i < ed.lineCount(); i++) { const l = ed.getLine(i); if (l.includes("sample-landscape")) out.push(i + ":" + l.slice(0, 70)); } return " | landscape lines: " + out.join(" ; "); })()`);
    }
    const targetIsCanonical = !!lineNow && canonical.test(lineNow)
      && (place !== "cell" || (lineNow.match(/^\s{0,3}\|\s*([^|]*?)\s*\|/)?.[1]?.trim() ?? "") === targetLabel);
    rec(`${name} — the commit itself writes the canonical ${useMd ? "md" : "wiki"} target line (one write)`, targetIsCanonical, JSON.stringify(lineNow) + commitDiag);
    if (place === "cell") {
      const changedLines = sourceBefore.flatMap((line, index) => line === sourceAfterCommit[index] ? [] : [index]);
      const changedSameFileLines = sameFileLines.filter(({ index, line }) => index !== targetLine && sourceAfterCommit[index] !== line);
      rec(`${name} — only the exact target source row changes`,
        changedLines.length === 1 && changedLines[0] === targetLine,
        `changed=${changedLines.join(",")}`);
      rec(`${name} — earlier solo and every other same-file occurrence stay byte-identical`,
        changedSameFileLines.length === 0,
        `changed=${changedSameFileLines.map(({ index }) => index).join(",") || "none"}`);
    }
    const editsAfterCommit = await cdp.evaluate("window.__thEdits");
    rec(`${name} — changed commit emits exactly one editor-change/source write`,
      editsAfterCommit === 1, `(${editsAfterCommit})`);

    const unchangedSourceBefore = await cdp.evaluate(`(() => {
      window.__thEdits = 0;
      return app.workspace.activeEditor.editor.getValue();
    })()`);
    const unchangedOpened = await openJourneySizeModal(place, targetLine, cellIndex);
    rec(`${name} — unchanged-size modal reopens on the exact target`, unchangedOpened === true, String(unchangedOpened));
    if (unchangedOpened === true) {
      await cdp.evaluate(`(() => {
        const wIn = document.querySelectorAll(".lie-submenu input")[0];
        if (wIn) { wIn.focus(); wIn.value = "120"; wIn.dispatchEvent(new Event("input", { bubbles: true })); }
        document.querySelector(".lie-submenu-confirm")?.click();
        return true;
      })()`);
      await wait(700);
    }
    const unchangedResult = await cdp.evaluate(`(() => ({
      edits: window.__thEdits,
      source: app.workspace.activeEditor.editor.getValue()
    }))()`);
    rec(`${name} — unchanged size commit emits no editor-change/source write`,
      unchangedOpened === true && unchangedResult.edits === 0, `(${unchangedResult.edits})`);
    rec(`${name} — unchanged size commit leaves the note byte-identical`,
      unchangedOpened === true && unchangedResult.source === unchangedSourceBefore);

    // STABILITY (F27): an unrelated edit elsewhere must not rewrite the target — no follow-up write
    await cdp.evaluate(`(() => {
      window.__thEdits = 0;
      const ed = app.workspace.activeEditor.editor;
      ed.setCursor({ line: 0, ch: 0 });
      ed.replaceRange("x", { line: 0, ch: ed.getLine(0).length });
      return true;
    })()`);
    await wait(1200);
    const lineStable = await cdp.evaluate(`app.workspace.activeEditor.editor.getLine(${targetLine})`);
    const editsAfterIdle = await cdp.evaluate("window.__thEdits");
    await cdp.evaluate(`(() => { const ed = app.workspace.activeEditor.editor; const t = ed.getLine(0); if (t.endsWith("x")) ed.replaceRange("", { line: 0, ch: t.length - 1 }, { line: 0, ch: t.length }); app.workspace.offref(window.__thEditsRef); window.__thEditsRef = null; return true; })()`);
    rec(`${name} — stable: no background rewrite after an unrelated edit (edits 0→${editsAfterIdle}, only the unrelated one)`,
      lineStable === lineNow && editsAfterIdle === 1, JSON.stringify(lineStable));
    await wait(600);
    // cursor out → the image must render, no raw text
    await clickOutro();
    if (place === "solo") {
      await scrollToLine(targetLine);
      const s = await cdp.evaluate(`(() => {
        const cm = app.workspace.activeEditor.editor.cm;
        const hit = [...document.querySelectorAll(".workspace-leaf.mod-active .cm-content .lie-wrapper")].find((w) => { try { return cm.state.doc.lineAt(cm.posAtDOM(w)).number === ${SOLO_LINES[1] + 1}; } catch (e) { return false; } });
        const img = hit && hit.querySelector(".lie-box img, img");
        let host = null;
        try { const d = cm.domAtPos(cm.state.doc.line(${SOLO_LINES[1] + 1}).from); host = (d.node.nodeType === 1 ? d.node : d.node.parentElement).closest(".cm-line"); } catch (e) {}
        return { imgW: img ? img.offsetWidth : 0, raw: host ? /\\{[^}]*\\}|!\\[\\[|!\\[\\]|quoted-tail/.test(host.innerText || "") : false };
      })()`);
      rec(`${name} — after commit + cursor-out the image renders, no raw text`, s.imgW > 0 && !s.raw, JSON.stringify(s));
    } else {
      await scrollToTable();
      const pj = await probeCells();
      let cellDiag = "";
      if (!(pj.cells.length === 8 && pj.cells.every((c) => c.inEditor || (c.visImgs === 1 && !c.raw)))) {
        cellDiag = await cdp.evaluate(`(() => { const t = [...document.querySelectorAll(${JSON.stringify(TABLE_SEL)})].find((x) => x.offsetWidth > 0); const tr = t && [...t.querySelectorAll("tr")].filter((r) => r.querySelector("td"))[0]; return tr ? " cell0=" + JSON.stringify((tr.children[1]?.innerText || "").slice(0, 80)) : " no-row"; })()`);
      }
      rec(`${name} — after commit + cursor-out every cell shows its image, no raw text`,
        pj.cells.length === 8 && pj.cells.every((c) => c.inEditor || (c.visImgs === 1 && !c.raw)),
        `(${pj.cells.map((c) => c.inEditor ? "E" : `${c.visImgs}${c.raw ? "R" : ""}`).join("")})` + cellDiag);
      rec(`${name} — the exact target cell renders after commit + cursor-out`,
        !!pj.cells[cellIndex] && !pj.cells[cellIndex].inEditor
          && pj.cells[cellIndex].visImgs === 1 && !pj.cells[cellIndex].raw,
        JSON.stringify(pj.cells[cellIndex] || null));
      if (pj.cellEditorOpen) console.log("WARN  cell editor still open after click-away (open observation)");
    }
  };
  await journey(true, "solo");
  await journey(false, "solo");
  await journey(true, "cell", 0);
  await journey(false, "cell", 6);
  await setLinkFormat(true);

  // ============================ reconcile instrumentation (F27) =================================
  {
    await openFixture(fixtureContent());
    await cursorOut();
    await scrollToTable();
    await wait(1500); // let all render-op reconciles settle
    const sourceBeforePassive = await readFixture();
    await cdp.evaluate(`(() => {
      window.__thPassiveEdits = 0;
      window.__thPassiveRef = app.workspace.on("editor-change", () => window.__thPassiveEdits++);
      return true;
    })()`);
    const before = await cdp.evaluate(`app.plugins.plugins["live-image-editor"].reconcileRunCount`);
    const pt = await cdp.evaluate(`(() => { const t = [...document.querySelectorAll(${JSON.stringify(TABLE_SEL)})].find((x) => x.offsetWidth > 0); const img = t && [...t.querySelectorAll("img")].find((i) => i.offsetWidth > 0); if (!img) return null; const r = img.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (pt) { await cdp.hover(pt.x, pt.y); await wait(800); await cdp.hover(pt.x + 10, pt.y + 5); await wait(800); }
    const toolbarUp = await cdp.evaluate(`!!document.querySelector(".lie-toolbar-floating, .lie-toolbar-in-image")`);
    const after = await cdp.evaluate(`app.plugins.plugins["live-image-editor"].reconcileRunCount`);
    const passiveEdits = await cdp.evaluate("window.__thPassiveEdits");
    const sourceAfterHover = await readFixture();
    rec(`hover/toolbar (toolbar=${toolbarUp}) triggers ZERO reconcile runs (F27)`, after === before, `(${before}→${after})`);
    rec("settle + real hover perform no editor source change", passiveEdits === 0, `(${passiveEdits} editor-change events)`);
    rec("settle + real hover leave note source byte-identical", sourceAfterHover === sourceBeforePassive);
    await cdp.hover(4, 4);
    await wait(1500);
    const idle1 = await cdp.evaluate(`app.plugins.plugins["live-image-editor"].reconcileRunCount`);
    await wait(1500);
    const idle2 = await cdp.evaluate(`app.plugins.plugins["live-image-editor"].reconcileRunCount`);
    rec("the reconcile counter SETTLES when idle (no standing automatism)", idle2 === idle1, `(${idle1}→${idle2})`);
    const sourceAfterIdle = await readFixture();
    const passiveEditsAfterIdle = await cdp.evaluate("window.__thPassiveEdits");
    rec("idle reconcile settle performs no editor source change", passiveEditsAfterIdle === 0, `(${passiveEditsAfterIdle} editor-change events)`);
    rec("idle reconcile settle leaves note source byte-identical", sourceAfterIdle === sourceBeforePassive);
    await cdp.evaluate(`(() => { if (window.__thPassiveRef) app.workspace.offref(window.__thPassiveRef); window.__thPassiveRef = null; return true; })()`);
  }

  // ================================ console errors ==============================================
  const errs = await cdp.evaluate("window.__thErrors");
  rec("no console errors / unhandled rejections during the run", errs.length === 0, errs.slice(0, 3).join(" | "));
} catch (e) {
  console.log("FATAL: " + ((e && e.stack) || e));
  process.exitCode = 2;
} finally {
  try {
    await cdp.evaluate(`(async () => {
      const p = app.plugins.plugins["live-image-editor"];
      if (window.__thEditsRef) app.workspace.offref(window.__thEditsRef);
      if (window.__thPassiveRef) app.workspace.offref(window.__thPassiveRef);
      if (window.__thDispatchGuard) {
        const guard = window.__thDispatchGuard;
        if (guard.descriptor) Object.defineProperty(guard.cm, "dispatchTransactions", guard.descriptor);
        else delete guard.cm.dispatchTransactions;
        window.__thDispatchGuard = null;
      }
      app.vault.setConfig("useMarkdownLinks", ${orig ? JSON.stringify(orig.useMd) : "true"});
      if (p) { p.settings.defaultRevealState = ${orig ? JSON.stringify(orig.reveal) : '"native"'}; p.settings.showCaptions = ${orig ? JSON.stringify(orig.captions) : "false"}; p.refreshLivePreviewDecorations(); }
      const f = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
      if (f) await app.vault.delete(f);
    })()`);
    await cdp.focusEmulation(false);
  } catch { /* teardown best-effort */ }
  cdp.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) { console.log("table-host guard FAILED"); process.exit(1); }
console.log("table-host guard OK");
