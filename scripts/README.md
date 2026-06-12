# Scripts

Helper scripts for building, installing, releasing, debugging and documenting the plugin. They fall
into five groups: **build & install**, **release**, **demo assets**, **docs site**, and **live
debugging over CDP**.

Each script's own header comment is the authoritative reference; this file is the map. Note **where**
each one runs — some are container-side, some must run on the **host** (macOS) where Obsidian lives.

## Build & install

- Devcontainer setup (the `initializeCommand` **`prebuild.sh`**, the `Dockerfile` and `.env`) lives in
  **`.devcontainer/`**, not here. On the **host**, `prebuild.sh` writes `USER_NAME` / `USER_UID` /
  `USER_GID` / `VARIANT` into `.devcontainer/.env` — all derived from the host — so the container user
  matches the host (uid + gid → files stay host-owned, never root). Runs automatically on container start.
- **`dev-install.sh <vault-path> [--dev]`** — build the plugin and copy `main.js` / `manifest.json` /
  `styles.css` into `<vault>/.obsidian/plugins/live-image-editor/`. Detects its context: on the
  **host** it spins up the devcontainer (`@devcontainers/cli`) and builds inside it; **inside** the
  container it builds directly. `--dev` produces a debug build (inline source maps, not minified, and
  the in-plugin CDP relay) for DevTools debugging; omit it for a production build. The script can
  lose its `+x` bit on a fresh container — invoke it as `bash scripts/dev-install.sh <vault>`.

## Release

- **`release.sh [<commit-msg> <tag-msg>]`** — cut a release: **builds first** (fail-fast — generates
  `main.js`), then makes ONE versioned commit, an annotated tag, pushes, creates the GitHub release
  with `main.js` / `manifest.json` / `styles.css` attached as binaries (Obsidian SR rule), and finally
  **verifies** it went through (tag on origin, release + all three assets present). The summary shows
  each asset's size. The **version comes from `package.json`** (the
  SSOT — never typed); you supply only the commit + tag message (interactively via
  `bash scripts/release.sh`, or as two args). The version is auto-prepended — commit
  `chore(release): v<v> — <msg>`, tag message `v<v> - <msg>` — the tag name is bare (e.g. `0.5.0`), and
  notes = `v<v> - <msg>` + blank line + the matching `## [<v>]` CHANGELOG section. It **refuses to run**
  unless `package.json` == `manifest.json`, a valid `## [<v>]` CHANGELOG section (newest entry,
  dated, non-empty) exists, and there is **no existing tag (local/origin) or GitHub release** for the
  version, and it **summarises
  everything and waits for an explicit `y`** — anything else aborts with **nothing done** (no build,
  commit, tag, push, or release; `RELEASE_ASSUME_YES=1` skips only the prompt). The `/release` skill
  (`.claude/skills/release/`) wraps it: it offers **editable** generated commit/tag messages,
  summarises, and runs it only after the user explicitly confirms. Run inside the devcontainer (needs
  the build toolchain + `gh`).

## Demo assets

- **`generate-samples.sh`** *(container; needs ImageMagick `magick`)* — regenerates the synthetic
  sample images in `example-vault/images/` (`sample-landscape.png` 3:2, `sample-portrait.png` 2:3,
  `sample-square.png` 1:1). They carry corner labels **A/B/C/D** and a **TOP** marker so rotate/flip
  are unambiguous, and are drawn from scratch (no third-party content → safe to commit). Set
  `LIE_FONT` to override the font path on containers with no default ImageMagick font.

## Docs site (ProperDocs + MaterialX)

- **`mkdocs_hooks.py`** — a build hook (registered in `mkdocs.yml`, run by **ProperDocs** — the
  maintained MkDocs 1.x fork; see `docs/development/issues.md` → Decision 11). It **copies** the demo
  vault's feature pages + images into `docs/examples/` for the duration of a `build`/`serve` and
  removes them again on exit (`atexit`), so `example-vault/` stays the single source and no second
  copy is ever committed (only the committed `docs/examples/README.md` landing page survives). It
  also rewrites repo-root-relative source links (e.g. `[main.ts](src/main.ts#L141)`) that point
  outside `docs/` to their GitHub blob URLs so they don't 404 on the site. Not run by hand —
  `properdocs` invokes it.
- **`shoot-docs.mjs`** *(container, over CDP)* — captures the user-guide screenshots in
  `docs/img/*.png` (`toolbar`, `rotate`, `crop`, `filter-panel`, `float-wrap`, `caption`) from the
  **example vault** running in Obsidian. Each shot opens a demo page, arranges the feature's state
  (hover / open a panel / start crop / scroll a virtualized image into render range) via an in-page
  setup script, then `Page.captureScreenshot` clipped to the feature. Run all shots with
  `node scripts/shoot-docs.mjs`, or a subset by name: `node scripts/shoot-docs.mjs toolbar rotate`.
  Defaults to `CDP_PORT=9223` (direct to Obsidian — survives `location.reload()`).

## Live debugging over CDP

Obsidian is an Electron app; launched with `--remote-debugging-port` it exposes the Chrome DevTools
Protocol. It binds CDP to `127.0.0.1` on the **host**, so the container reaches it via a relay (the
dev build ships its own in-plugin relay; `cdp-relay.mjs` is the manual fallback). See CLAUDE.md →
*Live debugging in Obsidian (CDP)* for the full workflow and gotchas.

- **`obsidian-dev.command`** *(host, macOS — double-clickable in Finder)* — the launcher. Quits any
  running Obsidian, relaunches it with `--remote-debugging-port=9223 --remote-allow-origins=*`, and
  registers + opens the bundled `example-vault/` so the plugin is ready to debug. There is no in-app
  toggle for the debug port — it must be a launch flag, hence this script. Override via env:
  `CDP_PORT`, `OBSIDIAN_APP`, `VAULT`.
- **`cdp-relay.mjs`** *(host — fallback only)* — a tiny zero-dependency TCP relay that forwards
  `0.0.0.0:9222` → Obsidian's loopback CDP, so a container process can reach it via
  `host.containers.internal`. Only needed when **not** using a dev build (whose in-plugin relay does
  the same). `socat TCP-LISTEN:9222,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9222` is equivalent.
- **`obsidian-debug.mjs`** *(container)* — the main CDP client. `--list` lists debuggable targets;
  no flag tails `console.*` and uncaught exceptions live; `--eval '<expr>'` evaluates one expression
  in the plugin's context and prints it. Env: `CDP_HOST` (default `host.containers.internal`),
  `CDP_PORT` (default `9222`), `CDP_TARGET` (window match). Example:
  `node scripts/obsidian-debug.mjs --eval 'app.plugins.plugins["live-image-editor"]?.manifest.version'`.
- **`obsidian-screenshot.mjs`** *(container)* — capture the running Obsidian window to a PNG for
  visual inspection: `node scripts/obsidian-screenshot.mjs out.png`. `--selector '.lie-wrapper'`
  clips around an element (with `--pad`), `--eval '<expr>'` runs a setup expression before the shot.
  (For the curated user-guide shots use `shoot-docs.mjs` instead.)
- **`obsidian-focus-eval.mjs`** *(container — research helper)* — enables CDP focus emulation (so the
  editor behaves as if the window is focused while backgrounded), then runs a sequence of evals with
  waits in **one** connection: `node scripts/obsidian-focus-eval.mjs '<expr1>' --wait 1200 '<expr2>'`.
  Useful for reproducing focus-dependent behaviour headlessly.
