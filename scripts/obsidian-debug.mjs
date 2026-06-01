#!/usr/bin/env node
// Zero-dependency Chrome DevTools Protocol (CDP) client for live-debugging the
// Live Image Editor plugin in a running Obsidian instance — from INSIDE the
// devcontainer.
//
// Obsidian is an Electron app; launched with --remote-debugging-port it exposes
// a CDP endpoint. This script attaches to the main window's renderer and:
//   * tails console.* output and uncaught exceptions live, or
//   * evaluates a single expression in the plugin's context and prints it.
//
// Usage (from /workspace):
//   node scripts/obsidian-debug.mjs                  # tail console + exceptions
//   node scripts/obsidian-debug.mjs --list           # list debuggable targets
//   node scripts/obsidian-debug.mjs --eval '<expr>'  # evaluate once, print, exit
//
// Examples:
//   node scripts/obsidian-debug.mjs --eval 'app.plugins.plugins["live-image-editor"]?.manifest.version'
//   node scripts/obsidian-debug.mjs --eval 'document.querySelectorAll("img.lie-img").length'
//
// Environment:
//   CDP_HOST    host to reach Obsidian's debug port (default: host.containers.internal)
//   CDP_PORT    debug port / relay port (default: 9222)
//   CDP_TARGET  substring to match a target's title or url (default: the app window)
//
// Cross-boundary note: Obsidian runs on the HOST and binds CDP to 127.0.0.1.
// Run a relay on the host so the container can reach it, e.g.:
//   socat TCP-LISTEN:9222,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9222
// or:  node scripts/cdp-relay.mjs   (copy it to the host first)

import http from "node:http";
import dns from "node:dns/promises";

const HOST = process.env.CDP_HOST || "host.containers.internal";
const PORT = Number(process.env.CDP_PORT || 9222);
const TARGET_MATCH = process.env.CDP_TARGET || "";

const args = process.argv.slice(2);
const mode = args.includes("--list")
  ? "list"
  : args.includes("--eval")
    ? "eval"
    : "tail";
const evalExpr = args[args.indexOf("--eval") + 1];

if (mode === "eval" && (!evalExpr || evalExpr.startsWith("--"))) {
  console.error("Error: --eval requires an expression argument.");
  process.exit(2);
}

// Resolve to an IP so Chromium's Host-header (anti-DNS-rebinding) check passes:
// a hostname Host header is rejected, an IP/localhost one is accepted.
let ip;
try {
  ip = (await dns.lookup(HOST)).address;
} catch {
  ip = HOST; // already an IP, or let the connection attempt surface the error
}

function httpGetJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: ip, port: PORT, path, headers: { Host: `${ip}:${PORT}` }, timeout: 4000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${path}: ${body.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Bad JSON from ${path}: ${e.message}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function fail(err) {
  console.error(`\n✗ Could not reach Obsidian CDP at ${HOST}:${PORT} (${ip}:${PORT})`);
  console.error(`  ${err.message}`);
  console.error("\n  Checklist:");
  console.error("   1. Obsidian started on the host with:");
  console.error("        --remote-debugging-port=9222 --remote-allow-origins=*");
  console.error("   2. A relay exposes it to the container (CDP binds to 127.0.0.1):");
  console.error("        socat TCP-LISTEN:9222,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9222");
  console.error("   3. CDP_HOST/CDP_PORT point at that relay.");
  process.exit(1);
}

let targets;
try {
  await httpGetJson("/json/version"); // sanity check
  targets = await httpGetJson("/json");
} catch (err) {
  fail(err);
}

// Pick the Obsidian app window: a renderer page, preferably the obsidian.md app.
const pages = targets.filter((t) => t.type === "page");
function score(t) {
  const hay = `${t.title || ""} ${t.url || ""}`.toLowerCase();
  if (TARGET_MATCH && hay.includes(TARGET_MATCH.toLowerCase())) return 3;
  if ((t.url || "").startsWith("app://obsidian.md")) return 2;
  if (hay.includes("obsidian")) return 1;
  return 0;
}
const chosen = pages.sort((a, b) => score(b) - score(a))[0];

if (mode === "list") {
  if (!pages.length) console.log("(no page targets found)");
  for (const t of pages) {
    console.log(`${score(t) ? "→" : " "} [${t.type}] ${t.title || "(untitled)"}\n   ${t.url}`);
  }
  process.exit(0);
}

if (!chosen) fail(new Error("no debuggable 'page' target found"));

// Rewrite the ws URL to the IP:PORT we actually reach (CDP reports localhost).
const wsUrl = chosen.webSocketDebuggerUrl.replace(
  /^ws:\/\/[^/]+/,
  `ws://${ip}:${PORT}`,
);

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function fmtArg(a) {
  if (a == null) return String(a);
  if (a.type === "string") return a.value;
  if ("value" in a) return JSON.stringify(a.value);
  if (a.description) return a.description;
  return a.type;
}

ws.addEventListener("error", (e) => fail(new Error(e.message || "websocket error")));

ws.addEventListener("open", async () => {
  await send("Runtime.enable");
  await send("Log.enable");

  if (mode === "eval") {
    const res = await send("Runtime.evaluate", {
      expression: evalExpr,
      awaitPromise: true,
      returnByValue: true,
      replMode: true,
    });
    if (res.exceptionDetails) {
      console.error("✗ Exception:", res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      process.exit(1);
    }
    const r = res.result;
    console.log("value" in r ? JSON.stringify(r.value, null, 2) : r.description || r.type);
    process.exit(0);
  }

  console.error(`● Attached to: ${chosen.title || chosen.url}`);
  console.error("● Tailing console + exceptions. Ctrl+C to stop.\n");
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    return msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
  switch (msg.method) {
    case "Runtime.consoleAPICalled": {
      const { type, args: cargs } = msg.params;
      console.log(`[${type}] ${cargs.map(fmtArg).join(" ")}`);
      break;
    }
    case "Runtime.exceptionThrown": {
      const d = msg.params.exceptionDetails;
      console.error(`[exception] ${d.exception?.description || d.text}`);
      break;
    }
    case "Log.entryAdded": {
      const e = msg.params.entry;
      if (e.level === "error" || e.level === "warning") {
        console.log(`[${e.level}] ${e.text}${e.url ? `  (${e.url})` : ""}`);
      }
      break;
    }
  }
});

ws.addEventListener("close", () => {
  if (mode === "tail") {
    console.error("\n● Connection closed.");
    process.exit(0);
  }
});
