# CLAUDE.md

## Project

Obsidian plugin: **Live Image Editor** (id `live-image-editor`; GitHub repo `obsidian-live-image-editor`).
Non-destructive image editing via CSS transforms and filters — the original image file is **never** modified. A hover toolbar with native Lucide icons lets the user rotate, flip, crop (with free rotation), resize, filter and export images, plus apply predefined or vault-snippet CSS classes. The plugin follows Obsidian's locale and its central "Use [[Wikilinks]]" setting; it adds no language or link-format setting of its own.

## Documentation

This file is the **build & debug guide** only. The design — requirements, architecture, plan, tests, bugs — lives in `documentation/`, one source of truth per altitude. Ground any research or change on the artifact at the right altitude, not on this file's prose.

- **`documentation/requirements.md`** — the F/D/T requirements (functional / design / technical): *what it does, how it looks, how it must be built*. Coding conventions live in the T-items (naming/prefix, no runtime deps, pure `*-logic.ts` units, linter kept as-shipped).
- **`documentation/architecture.md`** — mid-level decisions (`AD1–AD9`) and building blocks (`AB…`); data flow; the **R0** uniform-rendering model.
- **`documentation/implementation-plan.md`** — low-level: the module map (file → block → exports), per-layer realization, pitfalls.
- **`documentation/test-plan.md`** — the test strategy (currently a draft).
- **`documentation/issues.md`** — the bug & lesson registry: every defect and hard-won lesson, open or solved, each with cause + fix (the old `[LEARNED]` `T-Ln` are here as `L1–L10`).
- **`documentation/open-items.md`** — the live backlog: open decisions, verifications, deferred ideas, the DRY/KISS audit, and the implementation effort.
- **`documentation/methodology.md`** / **`agent_methodology.md`** — the core principles (DRY, KISS, elegance, think-first, ground-up) and how we work.

## Build & Test

All commands run inside the devcontainer (podman). Never install or build on the host.

```bash
npm run build      # tsc -noEmit + esbuild production
npm run lint       # eslint src/
npm test           # vitest run
npm run dev        # esbuild watch mode
npm run dev:vault  # esbuild watch -> writes straight into the examples/ vault plugin dir (Developer Toolbox auto-reloads)
npm run check:watch  # tsc -noEmit --watch (live type errors in the terminal; esbuild does not type-check)
```

Install into a vault for testing:
```bash
./scripts/dev-install.sh ~/path/to/vault          # production build
./scripts/dev-install.sh ~/path/to/vault --dev    # debug build (inline source maps, not minified)
```

Build gotcha — `esbuild: Failed to write to output file: open /workspace/main.js: permission denied`: a pre-existing `main.js` couldn't be overwritten (verified fix: `rm -f main.js && npm run build`; likely cause — the file was owned by another uid, e.g. created on the host or by root, so the container user couldn't write it; not independently confirmed).

## Live debugging in Obsidian (CDP)

Obsidian (Electron) exposes the Chrome DevTools Protocol; from inside the devcontainer any session can tail console/exceptions and evaluate code in the running plugin. CDP binds to 127.0.0.1 on the host, so it needs re-exposing — the **dev build does this itself** via an in-plugin relay (`src/dev-bridge.ts`, tree-shaken out of production). No host-side relay process.

Setup — on the HOST, launch Obsidian with the debug port (CDP on 9223; the plugin relay re-exposes it on 0.0.0.0:9222). Use the launcher (double-clickable in Finder), or the raw command — there is no in-app UI toggle (it's an Electron launch flag):
```bash
scripts/obsidian-dev.command   # quits any running Obsidian, relaunches with the flags (macOS)
# equivalent: /Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9223 --remote-allow-origins=*
```
Then enable a **dev build** of the plugin in the vault (`npm run dev:vault`, or `./scripts/dev-install.sh <vault> --dev`). On load it logs `[lie-dev-bridge] CDP relay ...`.

From the devcontainer (reaches the host via host.containers.internal; connects by IP so Chromium's Host-header anti-rebinding check passes):
```bash
node scripts/obsidian-debug.mjs --list             # list debuggable targets
node scripts/obsidian-debug.mjs                     # tail console + exceptions
node scripts/obsidian-debug.mjs --eval 'app.plugins.plugins["live-image-editor"]?.manifest.version'
```
Override the endpoint with `CDP_HOST` / `CDP_PORT` (default `host.containers.internal:9222`). Fallback if not using a dev build: run `scripts/cdp-relay.mjs` (or socat) on the host instead.

CDP gotchas:
- `location.reload()` via `--eval` does a clean full reload (the relay restarts with the plugin) — better than `disablePlugin`/`enablePlugin`, which can accumulate stale registrations.
- **Relay (9222) flaps after a plugin reload** (the in-plugin relay's old `0.0.0.0:9222` socket lingers in TIME_WAIT, so the new one can't rebind — the relay *logs* it's up but the port is refused). Workaround: connect **directly to Obsidian's own CDP with `CDP_PORT=9223`** — that's reachable from the container and survives `location.reload()`. With multiple windows open, `9223` may target the wrong one; the relay (9222), once back, reliably hits the main window. After a reload, give it ~20–30s and re-poll.
- **Stale-build trap:** with `npm run dev:vault` watching, two quick saves can make Developer-Toolbox load an *intermediate* build (e.g. a function renamed at the call site but not yet at the definition → `ReferenceError: X is not defined`, which looks like "rendering broke"). The on-disk build is fine; force a clean `location.reload()` to load it. Verify the running build via the console exception, not assumptions.
- `--eval` returns an arrow function as `{}` if you forget to invoke it; wrap returns in `JSON.stringify(...)` for arrays/objects.
- (Never `disablePlugin` the plugin — see `documentation/issues.md` → **L4**.)
