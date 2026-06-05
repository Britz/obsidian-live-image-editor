#!/usr/bin/env node
// Capture the user-guide screenshots from the examples demo vault via CDP.
// Each shot: open a demo page, arrange the feature's state (hover / open a panel / start crop),
// then Page.captureScreenshot clipped to the feature. Writes docs/img/*.png.
//
//   node scripts/shoot-docs.mjs            # all shots
//   node scripts/shoot-docs.mjs toolbar    # only the named shot(s)
//
// Env: CDP_HOST (default host.containers.internal), CDP_PORT (default 9223 — direct to Obsidian,
// survives reloads), CDP_TARGET (default "examples" — the demo vault window).
import http from "node:http";
import dns from "node:dns/promises";
import fs from "node:fs";

const HOST = process.env.CDP_HOST || "host.containers.internal";
const PORT = Number(process.env.CDP_PORT || 9223);
const TARGET = (process.env.CDP_TARGET || "examples").toLowerCase();
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

// Each setup runs in the page. `rectOf` returns a padded rect; `union` merges element rects.
const HELPERS = `
  const rectOf = (sel, pad=20) => { const el = document.querySelector(sel); if(!el) return null; const r = el.getBoundingClientRect(); return {x:Math.max(0,r.x-pad), y:Math.max(0,r.y-pad), width:r.width+pad*2, height:r.height+pad*2}; };
  const open = async (path) => { const f = app.vault.getAbstractFileByPath(path); await app.workspace.getLeaf(false).openFile(f); await new Promise(r=>setTimeout(r,1200)); };
  const wrapAt = (n) => Array.from(document.querySelectorAll(".lie-wrapper"))[n];
`;

const SHOTS = [
  // Toolbar revealed over a normal image (hover).
  { name: "toolbar", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.rotate)});
      const w = wrapAt(0); const r = w.getBoundingClientRect();
      return JSON.stringify({ clip: rectOf(".lie-wrapper", 28), hoverAt: { x: r.x + r.width/2, y: r.y + r.height/2 } });
    })()` },
  // A rotated image result (90°).
  { name: "rotate", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.rotate)});
      let w = wrapAt(1); w.scrollIntoView({block:"center"});
      await new Promise(r=>setTimeout(r,700));
      w = wrapAt(1) || w; const r = w.getBoundingClientRect();
      return JSON.stringify({ clip: { x:Math.max(0,r.x-24), y:Math.max(0,r.y-24), width:r.width+48, height:r.height+48 } });
    })()` },
  // Crop editor open in place.
  { name: "crop", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.crop)});
      const w = wrapAt(0); const img = w.querySelector("img");
      const p = app.plugins.plugins["live-image-editor"]; p.activeImage = img; p.crop();
      await new Promise(r=>setTimeout(r,700));
      return JSON.stringify({ clip: rectOf(".lie-wrapper", 70) });
    })()` },
  // Filter panel docked beside the image.
  { name: "filter-panel", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.filters)});
      const w = wrapAt(0); const img = w.querySelector("img");
      const p = app.plugins.plugins["live-image-editor"]; p.activeImage = img; p.toggleFilters();
      await new Promise(r=>setTimeout(r,700));
      const a = w.getBoundingClientRect(); const panel = document.querySelector(".lie-filter-panel");
      const b = panel ? panel.getBoundingClientRect() : a;
      const x = Math.max(0, Math.min(a.x,b.x)-24), y = Math.max(0, Math.min(a.y,b.y)-24);
      return JSON.stringify({ clip: { x, y, width: Math.max(a.right,b.right)-x+24, height: Math.max(a.bottom,b.bottom)-y+24 } });
    })()` },
  // Float + text wrap.
  { name: "float-wrap", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.layout)});
      const w = wrapAt(0); const r = w.getBoundingClientRect();
      const sizer = document.querySelector(".cm-sizer, .markdown-preview-sizer");
      const s = sizer ? sizer.getBoundingClientRect() : r;
      return JSON.stringify({ clip: { x:Math.max(0,r.x-16), y:Math.max(0,r.y-16), width: Math.min(s.width, 760), height: 320 } });
    })()` },
  // Caption below an image.
  { name: "caption", setup: `(async()=>{${HELPERS}
      await open(${JSON.stringify(PAGES.captions)});
      const cap = document.querySelector(".lie-caption"); const w = wrapAt(0);
      const a = w.getBoundingClientRect(); const b = cap ? cap.getBoundingClientRect() : a;
      const x = Math.max(0, Math.min(a.x,b.x)-28), y = Math.max(0, a.y-28);
      return JSON.stringify({ clip: { x, y, width: Math.max(a.right,b.right)-x+28, height: b.bottom-y+28 } });
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
