#!/usr/bin/env node
// CDP screenshot helper for the Live Image Editor — captures the running Obsidian
// window (or a clip around a selector) to a PNG so it can be inspected visually.
//
// Usage (from the devcontainer):
//   node scripts/obsidian-screenshot.mjs out.png
//   node scripts/obsidian-screenshot.mjs out.png --selector ".lie-wrapper"
//   node scripts/obsidian-screenshot.mjs out.png --eval '<setup expr run before capture>'
//
// Env: CDP_HOST (default host.containers.internal), CDP_PORT (default 9222).

import http from "node:http";
import dns from "node:dns/promises";
import fs from "node:fs";

const HOST = process.env.CDP_HOST || "host.containers.internal";
const PORT = Number(process.env.CDP_PORT || 9222);
const args = process.argv.slice(2);
const outFile = args.find((a) => !a.startsWith("--")) || "shot.png";
const selector = args.includes("--selector") ? args[args.indexOf("--selector") + 1] : null;
const setupExpr = args.includes("--eval") ? args[args.indexOf("--eval") + 1] : null;
const padding = args.includes("--pad") ? Number(args[args.indexOf("--pad") + 1]) : 24;

let ip;
try { ip = (await dns.lookup(HOST)).address; } catch { ip = HOST; }

function httpGetJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: ip, port: PORT, path, headers: { Host: `${ip}:${PORT}` }, timeout: 4000 }, (res) => {
      let body = ""; res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

const targets = await httpGetJson("/json");
const pages = targets.filter((t) => t.type === "page");
const score = (t) => {
  const hay = `${t.title || ""} ${t.url || ""}`.toLowerCase();
  if ((t.url || "").startsWith("app://obsidian.md")) return 2;
  if (hay.includes("obsidian")) return 1;
  return 0;
};
const chosen = pages.sort((a, b) => score(b) - score(a))[0];
if (!chosen) { console.error("no page target"); process.exit(1); }
const wsUrl = chosen.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${ip}:${PORT}`);

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    return msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});

ws.addEventListener("open", async () => {
  await send("Runtime.enable");
  await send("Page.enable");
  if (setupExpr) {
    await send("Runtime.evaluate", { expression: setupExpr, awaitPromise: true });
    await new Promise((r) => setTimeout(r, 600));
  }
  let clip;
  if (selector) {
    const res = await send("Runtime.evaluate", {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height}); })()`,
      returnByValue: true,
    });
    const v = res.result?.value;
    if (v) {
      const r = JSON.parse(v);
      clip = { x: Math.max(0, r.x - padding), y: Math.max(0, r.y - padding), width: r.width + padding * 2, height: r.height + padding * 2, scale: 1 };
    } else {
      console.error(`selector not found: ${selector}`);
    }
  }
  const shot = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
  fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
  console.log(`saved ${outFile}${clip ? ` (clip ${Math.round(clip.width)}x${Math.round(clip.height)})` : ""}`);
  process.exit(0);
});

ws.addEventListener("error", (e) => { console.error("ws error", e.message); process.exit(1); });
