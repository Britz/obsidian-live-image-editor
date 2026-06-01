// One-off: capture a screenshot of the live-preview embed area via CDP.
// Usage: node scripts/cdp-shot.mjs /tmp/shot.png
import http from "node:http";
import dns from "node:dns/promises";
import { writeFileSync } from "node:fs";

const HOST = process.env.CDP_HOST || "host.containers.internal";
const PORT = process.env.CDP_PORT || "9222";
const OUT = process.argv[2] || "/tmp/shot.png";

let ip;
try { ip = (await dns.lookup(HOST)).address; } catch { ip = HOST; }

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: ip, port: PORT, path, headers: { Host: `${ip}:${PORT}` }, timeout: 4000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

const targets = await getJson("/json");
const page = targets.filter((t) => t.type === "page").sort((a, b) => (b.url || "").startsWith("app://obsidian.md") - (a.url || "").startsWith("app://obsidian.md"))[0];
const wsUrl = page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${ip}:${PORT}`);
const ws = new WebSocket(wsUrl);
let id = 1; const pending = new Map();
const send = (method, params = {}) => { const i = id++; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener("open", r));

await send("Runtime.enable");
await send("Page.enable");
// scroll the rotated embed into view and get its rect (with margin)
const rect = await send("Runtime.evaluate", {
  expression: `(() => {
    const e = [...document.querySelectorAll(".lie-lp-embed")].find(x=>x.querySelector(".lie-rotate-box")) || document.querySelector(".lie-lp-embed");
    e.scrollIntoView({block:"center"});
    document.querySelectorAll(".lie-toolbar-in-image").forEach(t=>{t.style.opacity="1";t.style.pointerEvents="auto";});
    const r = e.getBoundingClientRect();
    return JSON.stringify({x:Math.max(0,r.left-30), y:Math.max(0,r.top-30), width:Math.min(1200,r.width+260), height:Math.min(900,r.height+90)});
  })()`,
  returnByValue: true,
});
const clip = JSON.parse(rect.result.value);
await new Promise((r) => setTimeout(r, 300));
const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
writeFileSync(OUT, Buffer.from(shot.data, "base64"));
console.log("saved " + OUT + " clip=" + JSON.stringify(clip));
ws.close();
