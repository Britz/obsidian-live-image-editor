#!/usr/bin/env node
// Tiny zero-dependency TCP relay — run this ON THE HOST (where Obsidian runs).
//
// Obsidian/Electron binds its --remote-debugging-port to 127.0.0.1 only, so a
// process in the devcontainer cannot reach it directly. This relay listens on
// all host interfaces and forwards to Obsidian's loopback CDP port, making it
// reachable from the container via host.containers.internal.
//
// Usage on the host:
//   node cdp-relay.mjs                 # 0.0.0.0:9222 -> 127.0.0.1:9222
//   LISTEN_PORT=9223 TARGET_PORT=9222 node cdp-relay.mjs
//
// Equivalent one-liner if you have socat:
//   socat TCP-LISTEN:9222,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9222

import net from "node:net";

const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 9222);
const TARGET_HOST = process.env.TARGET_HOST || "127.0.0.1";
const TARGET_PORT = Number(process.env.TARGET_PORT || 9222);

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST);
  client.pipe(upstream);
  upstream.pipe(client);
  const drop = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", drop);
  upstream.on("error", drop);
});

server.on("error", (e) => {
  console.error(`Relay error: ${e.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `CDP relay: ${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`,
  );
  console.log("Leave this running while debugging. Ctrl+C to stop.");
});
