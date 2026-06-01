import type { Plugin } from "obsidian";
import { createServer, connect } from "net";

// Dev-only CDP relay that runs INSIDE Obsidian (desktop plugins have Node access).
//
// Obsidian must be launched with --remote-debugging-port=<CDP_PORT>; its CDP
// server binds to 127.0.0.1 only, so a process in the devcontainer can't reach
// it directly. This relay re-exposes that port on all interfaces, so the
// container reaches it via host.containers.internal:<LISTEN_PORT> — no separate
// host-side relay process needed.
//
// Active only in dev builds: the single caller is behind `if (__LIE_DEV__)`, so
// this whole module (and its `net` require) is tree-shaken out of production.

const LISTEN_HOST = "0.0.0.0"; // reachable from the container, not just localhost
const LISTEN_PORT = 9222; // container connects to host.containers.internal:9222
const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9223; // Obsidian's actual --remote-debugging-port

export function startDevBridge(plugin: Plugin): void {
  const server = createServer((client) => {
    const upstream = connect(CDP_PORT, CDP_HOST);
    client.pipe(upstream);
    upstream.pipe(client);
    const drop = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", drop);
    upstream.on("error", drop);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[lie-dev-bridge] port ${LISTEN_PORT} already in use — relay not started`);
    } else {
      console.warn(`[lie-dev-bridge] relay error: ${err.message}`);
    }
  });

  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.log(
      `[lie-dev-bridge] CDP relay ${LISTEN_HOST}:${LISTEN_PORT} -> ${CDP_HOST}:${CDP_PORT} ` +
        `(launch Obsidian with --remote-debugging-port=${CDP_PORT} --remote-allow-origins=*)`,
    );
  });

  // Close the listener when the plugin unloads/reloads so the port is freed.
  plugin.register(() => server.close());
}
