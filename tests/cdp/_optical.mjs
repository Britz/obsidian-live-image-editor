#!/usr/bin/env node
// Reusable CDP "optical" client for the black-box / optical-regression test layer
// (test-plan §1: OBSERVE the visible painted result, not CSS properties — so the checks survive
// CSS refactors AND Obsidian version changes, the trigger for this whole layer).
//
// It connects to a running Obsidian (a DEV build installed in example-vault/ + Obsidian launched
// with the CDP relay — CLAUDE.md → "Live debugging"), and exposes a tiny async API:
//   • evaluate(expr)        — run JS in the plugin's renderer, await promises, return the value
//   • hover(x, y)           — move the REAL pointer so CSS `:hover` fires (synthetic events can't)
//   • screenshot(clip)      — capture a viewport region, decoded to RGBA pixels (PNG via node:zlib)
//   • close()
// plus pure pixel helpers: pixel(img, x, y), parseColor(str), near(a, b, tol).
//
// Defaults: CDP_HOST host.containers.internal, CDP_PORT 9223 (DIRECT to Obsidian — the 9222 relay
// flaps after a plugin reload, CLAUDE.md / Lesson 15), CDP_TARGET "example-vault". Override via env.
//
// Why its own WebSocket client (not scripts/obsidian-debug.mjs --eval): the optical checks need the
// Page (screenshot) and Input (real hover) CDP domains, which the --eval one-shot does not expose.

import http from "node:http";
import dns from "node:dns/promises";
import zlib from "node:zlib";

const HOST = process.env.CDP_HOST || "host.containers.internal";
const PORT = Number(process.env.CDP_PORT || 9223);
const TARGET_MATCH = process.env.CDP_TARGET || "example-vault";

function httpGetJson(ip, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: ip, port: PORT, path, headers: { Host: `${ip}:${PORT}` }, timeout: 4000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${path}`));
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`bad JSON from ${path}: ${e.message}`)); }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

export async function connectOptical() {
  let ip;
  try { ip = (await dns.lookup(HOST)).address; } catch { ip = HOST; }
  await httpGetJson(ip, "/json/version"); // sanity / anti-rebinding Host header
  const targets = await httpGetJson(ip, "/json");
  const pages = targets.filter((t) => t.type === "page");
  const score = (t) => {
    const hay = `${t.title || ""} ${t.url || ""}`.toLowerCase();
    if (TARGET_MATCH && hay.includes(TARGET_MATCH.toLowerCase())) return 3;
    if ((t.url || "").startsWith("app://obsidian.md")) return 2;
    if (hay.includes("obsidian")) return 1;
    return 0;
  };
  const chosen = pages.sort((a, b) => score(b) - score(a))[0];
  if (!chosen) throw new Error("no debuggable 'page' target — is Obsidian running with the CDP relay?");
  const wsUrl = chosen.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${ip}:${PORT}`);

  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      return m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("websocket error — CDP endpoint unreachable")), { once: true });
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  await send("Runtime.enable");
  await send("Page.enable");

  const rawEval = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, replMode: true });
    if (r.exceptionDetails) {
      throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result?.value;
  };
  // Evaluate an expression (sync OR async) and return its JSON-able value. An async eval resolves to
  // `{}` over this bridge even with awaitPromise (CLAUDE.md → Lesson 16), so we stash the result on a
  // window slot and POLL a sync read — the pattern verify-reveal/verify-crop use, generalized here.
  let evalSlot = 0;
  const evaluate = async (expr, { timeoutMs = 25000 } = {}) => {
    const slot = "__OPT_" + ++evalSlot;
    const q = JSON.stringify(slot);
    const kick = `(() => { window[${q}] = "__pending__";
      Promise.resolve().then(() => (async () => (${expr}))())
        .then((v) => { window[${q}] = JSON.stringify({ ok: true, v: v === undefined ? null : v }); })
        .catch((e) => { window[${q}] = JSON.stringify({ ok: false, err: String((e && e.stack) || e) }); });
      return true; })()`;
    await rawEval(kick);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await new Promise((r) => setTimeout(r, 300));
      const raw = await rawEval(`window[${q}] || ""`);
      if (raw && raw !== "__pending__") {
        let obj;
        try { obj = JSON.parse(raw); } catch { throw new Error("bad eval-result JSON: " + raw); }
        if (!obj.ok) throw new Error(obj.err);
        return obj.v;
      }
      if (Date.now() > deadline) throw new Error(`evaluate timed out after ${timeoutMs}ms`);
    }
  };
  // A real pointer move — the ONLY way to fire CSS `:hover` (a dispatched MouseEvent does not).
  const hover = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(x), y: Math.round(y), buttons: 0 });
  };
  // Capture a viewport region (CSS px, getBoundingClientRect coords) at 1:1 and decode to RGBA.
  const screenshot = async (clip) => {
    const r = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 },
    });
    return decodePng(Buffer.from(r.data, "base64"));
  };
  const close = () => { try { ws.close(); } catch { /* ignore */ } };

  return { evaluate, hover, screenshot, close };
}

// ---- minimal PNG decoder (8-bit, colorType 2/6, non-interlaced — what Chrome screenshots emit) ----
export function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }
  if (bitDepth !== 8) throw new Error("unsupported PNG bitDepth " + bitDepth);
  if (interlace !== 0) throw new Error("interlaced PNG unsupported");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error("unsupported PNG colorType " + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const o = y * stride, po = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[o + i - channels] : 0; // left
      const b = y > 0 ? out[po + i] : 0;                   // up
      const c = i >= channels && y > 0 ? out[po + i - channels] : 0; // upper-left
      let v = raw[pos++];
      switch (ft) {
        case 0: break;
        case 1: v = (v + a) & 255; break;
        case 2: v = (v + b) & 255; break;
        case 3: v = (v + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 255; break;
        }
        default: throw new Error("bad PNG filter " + ft);
      }
      out[o + i] = v;
    }
  }
  if (channels === 4) return { width, height, rgba: out };
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const s = p * channels, d = p * 4;
    if (channels === 3) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = 255; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = 255; }
  }
  return { width, height, rgba };
}

// [r, g, b, a] at (x, y), clamped to the image bounds.
export function pixel(img, x, y) {
  const cx = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const i = (cy * img.width + cx) * 4;
  return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
}

// Parse "#rgb" / "#rrggbb" / "rgb(...)" / "rgba(...)" → [r, g, b]; null if unrecognized.
export function parseColor(str) {
  if (!str) return null;
  const s = str.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split("").map((h) => parseInt(h + h, 16));
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = s.match(/^rgba?\(([^)]+)\)/i);
  if (m) return m[1].split(",").slice(0, 3).map((n) => Math.round(parseFloat(n)));
  return null;
}

// Manhattan colour distance within tolerance (per-channel sum).
export function near(a, b, tol = 60) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= tol;
}
