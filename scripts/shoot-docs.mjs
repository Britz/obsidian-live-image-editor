#!/usr/bin/env node
// Capture the user-guide screenshots from the vault-image-toolbar demo vault via CDP.
// Each shot: open a demo page, arrange the feature's state (hover / open a panel / start crop),
// then Page.captureScreenshot clipped to the feature. Writes docs/img/*.png.
//
//   node scripts/shoot-docs.mjs            # all shots
//   node scripts/shoot-docs.mjs toolbar    # only the named shot(s)
//
// Env: CDP_HOST (default host.containers.internal), CDP_PORT (default 9223 — direct to Obsidian,
// survives reloads), CDP_TARGET (default "vault-image-toolbar" — the demo vault window).
import http from "node:http";
import dns from "node:dns/promises";
import fs from "node:fs";

const HOST = process.env.CDP_HOST || "host.containers.internal";
const PORT = Number(process.env.CDP_PORT || 9223);
const TARGET = (process.env.CDP_TARGET || "vault-image-toolbar").toLowerCase();
const only = process.argv.slice(2);
const OUT = "docs/img";
fs.mkdirSync(OUT, { recursive: true });

let ip; try { ip = (await dns.lookup(HOST)).address; } catch { ip = HOST; }
function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: ip, port: PORT, path, headers: { Host: `${ip}:${PORT}` }, timeout: 4000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

const targets = await getJson("/json");
const page = targets.filter((t) => t.type === "page")
  .sort((a, b) => (`${b.title} ${b.url}`.toLowerCase().includes(TARGET) ? 1 : 0) - (`${a.title} ${a.url}`.toLowerCase().includes(TARGET) ? 1 : 0))[0];
if (!page) { console.error("no page target"); process.exit(1); }
const wsUrl = page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${ip}:${PORT}`);
const ws = new WebSocket(wsUrl);
let id = 1; const pending = new Map();
const send = (method, params = {}) => { const i = id++; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r, j) => pending.set(i, { r, j })); };
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); } });
const evalJson = async (expr) => {
  const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return res.result?.value ?? null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A shot arranges state via a setup IIFE that returns JSON { clip:{x,y,width,height}, hoverAt?:{x,y} }.
// `pad` grows the clip. `hover` (from hoverAt) dispatches a real CDP mouse move to trigger :hover.
const PAGES = {
  rotate: "01 — Rotate & flip.md",
  crop: "02 — Crop.md",
  filters: "04 — Filters.md",
  layout: "05 — Layout, float & wrap.md",
  captions: "06 — Captions.md",
};

// Each setup runs in the page. `rectEl`/`rectOf` return padded rects; `center` scrolls an element
// to the middle of the editor (the demo notes are long, so target images open below the fold and —
// in Live Preview — aren't even rendered until scrolled near). `editorTo` uses the editor API to
// scroll a virtualized image (e.g. the rotated one) into render range. `hideSB` drops the status bar
// so it never bleeds into a clip.
const HELPERS = `
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const rectEl = (el, pad=20) => { if(!el) return null; const r = el.getBoundingClientRect(); return {x:Math.max(0,r.x-pad), y:Math.max(0,r.y-pad), width:r.width+pad*2, height:r.height+pad*2}; };
  const rectOf = (sel, pad=20) => rectEl(document.querySelector(sel), pad);
  const open = async (path) => { const f = app.vault.getAbstractFileByPath(path); await app.workspace.getLeaf(false).openFile(f); await sleep(1200); };
  const wrapAt = (n) => Array.from(document.querySelectorAll(".lie-wrapper"))[n];
  const center = async (el) => { if(el){ el.scrollIntoView({block:"center"}); await sleep(650); } return el; };
  const hideSB = () => { if(!document.getElementById("lie-shot-hide")){ const s=document.createElement("style"); s.id="lie-shot-hide"; s.textContent=".status-bar{display:none!important}"; document.head.appendChild(s); } };
  const editorTo = async (re) => { const ed=app.workspace.activeEditor&&app.workspace.activeEditor.editor; if(!ed) return; const i=ed.getValue().split("\\n").findIndex(l=>re.test(l)); if(i>=0){ ed.scrollIntoView({from:{line:Math.max(0,i-2),ch:0},to:{line:i+1,ch:0}}, true); await sleep(800); } };
  const frameRot90 = () => Array.from(document.querySelectorAll(".lie-wrapper")).find(w=>{const fr=w.querySelector(".lie-frame"); const t=(fr&&fr.style.transform)||""; return /rotate\\(90deg/.test(t) && !/scale[XY]?\\(-/.test(t);});
`;

const SHOTS = [
  // Toolbar revealed over a normal image (hover), image centred in the editor.
  { name: "toolbar", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.rotate)});
      hideSB();
      const w = await center(wrapAt(0)); const r = w.getBoundingClientRect();
      return JSON.stringify({ clip: rectEl(w, 30), hoverAt: { x: r.x + r.width/2, y: r.y + r.height/2 } });
    })()` },
  // A rotated image result (90°): scroll the virtualized rotated image into view and clip its frame.
  { name: "rotate", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.rotate)});
      hideSB();
      await editorTo(/rotate=90 width=300/);
      let w = frameRot90(); if(w){ await center(w); w = frameRot90() || w; }
      const fr = (w && w.querySelector(".lie-frame")) || w;
      const r = fr.getBoundingClientRect();
      // start at the frame top so the revealed source line above the image is excluded
      return JSON.stringify({ clip: { x: Math.max(0, r.x-26), y: Math.max(0, r.y-2), width: r.width+52, height: r.height+10 } });
    })()` },
  // Crop editor open in place over a centred image.
  { name: "crop", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.crop)});
      hideSB();
      const w = await center(wrapAt(0)); const img = w.querySelector("img");
      const p = app.plugins.plugins["live-image-editor"]; p.activeImage = img; p.crop();
      await sleep(750);
      return JSON.stringify({ clip: rectEl(wrapAt(0) || w, 72) });
    })()` },
  // Filter panel docked beside the image — keep the image near the top so the tall panel fits.
  { name: "filter-panel", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.filters)});
      hideSB();
      const w = wrapAt(0); w.scrollIntoView({block:"start"}); await sleep(550);
      const img = w.querySelector("img");
      const p = app.plugins.plugins["live-image-editor"]; p.activeImage = img; p.toggleFilters();
      await sleep(750);
      const a = w.getBoundingClientRect(); const panel = document.querySelector(".lie-filter-panel");
      const b = panel ? panel.getBoundingClientRect() : a;
      const x = Math.max(0, Math.min(a.x,b.x)-24), y = Math.max(0, Math.min(a.y,b.y)-24);
      return JSON.stringify({ clip: { x, y, width: Math.max(a.right,b.right)-x+24, height: Math.max(a.bottom,b.bottom)-y+24 } });
    })()` },
  // Float left + text wrap: centre the float, clip the column so several wrapped lines show.
  { name: "float-wrap", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.layout)});
      hideSB();
      const w = await center(wrapAt(0)); const r = w.getBoundingClientRect();
      const x = Math.max(0, r.x-10);
      return JSON.stringify({ clip: { x, y: Math.max(0, r.y-14), width: Math.min(720, innerWidth-x-12), height: 300 } });
    })()` },
  // Caption below an image: clean (no toolbar). The .lie-box (.lie-has-caption) already wraps the
  // image AND the caption span, so clip that. Put the cursor on the line just ABOVE the image so
  // CM keeps that line in view (instead of re-anchoring to the top and drifting the image — and its
  // below-image caption — back under the fold), and re-centre right before the clip.
  { name: "caption", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.captions)});
      hideSB();
      const ed = app.workspace.activeEditor && app.workspace.activeEditor.editor;
      if(ed){ const i = ed.getValue().split("\\n").findIndex(l=>/A calm landscape at dusk\\]\\(/.test(l)); if(i>0) ed.setCursor({line:i-1,ch:0}); }
      await sleep(200);
      let w = await center(wrapAt(0));
      let box = (w && w.querySelector(".lie-box")) || w;
      box.scrollIntoView({block:"center"}); await sleep(450);
      w = wrapAt(0) || w; box = (w && w.querySelector(".lie-box")) || w;
      return JSON.stringify({ clip: rectEl(box, 18) });
    })()` },
];

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");
await send("Input.enable").catch(() => {});

let ok = 0;
for (const shot of SHOTS) {
  if (only.length && !only.includes(shot.name)) continue;
  try {
    const raw = await evalJson(shot.setup);
    const info = raw ? JSON.parse(raw) : {};
    if (info.hoverAt) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: info.hoverAt.x, y: info.hoverAt.y });
      await sleep(500);
    } else {
      // clear any leftover hover so a toolbar from a previous shot doesn't bleed in
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
      await sleep(200);
    }
    const clip = info.clip ? { ...info.clip, scale: 1 } : undefined;
    const shotRes = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
    const file = `${OUT}/${shot.name}.png`;
    fs.writeFileSync(file, Buffer.from(shotRes.data, "base64"));
    console.log(`saved ${file}${clip ? ` (${Math.round(clip.width)}x${Math.round(clip.height)})` : ""}`);
    ok++;
    // reset transient UI (close any open panel/crop) before the next shot
    await evalJson(`(()=>{ const p=app.plugins.plugins["live-image-editor"]; try{p.closeFilterPanel&&p.closeFilterPanel(false);}catch(e){} try{p.closeCrop&&p.closeCrop(false);}catch(e){} try{p.closeSubmenu&&p.closeSubmenu(false);}catch(e){} return 1; })()`);
    await sleep(300);
  } catch (e) { console.error(`FAIL ${shot.name}: ${e.message}`); }
}
console.log(`\n${ok} shot(s) saved to ${OUT}/`);
process.exit(0);
