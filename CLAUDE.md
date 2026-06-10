# CLAUDE.md

## Project

Obsidian plugin: **Live Image Editor** (id `live-image-editor`; GitHub repo `obsidian-live-image-editor`).
Non-destructive image editing via CSS transforms and filters — the original image file is **never** modified. A hover toolbar with native Lucide icons lets the user rotate, flip, crop (with free rotation), resize, filter and export images, plus apply predefined or vault-snippet CSS classes. The plugin follows Obsidian's locale and its central "Use [[Wikilinks]]" setting; it adds no language or link-format setting of its own.

## Interaction style

Work conversationally — short, back-and-forth replies in the user's language (German). Don't charge ahead or make changes on a whim, and don't dump walls of text or big tables: surface the decision in a sentence or two and wait for direction. (Recurring user preference.)

## Documentation

This file is the **build & debug guide** only. The design — requirements, architecture, plan, tests, bugs — lives in `docs/development/`, one source of truth per altitude (see its `README.md` for the index). Ground any research or change on the artifact at the right altitude, not on this file's prose.

- **`docs/development/requirements.md`** — the F/D/T requirements (functional / design / technical): *what it does, how it looks, how it must be built*. Coding conventions live in the T-items (naming/prefix, no runtime deps, pure `*-logic.ts` units, linter kept as-shipped).
- **`docs/development/architecture.md`** — mid-level decisions (`AD1–AD9`) and building blocks (`AB…`); data flow; the **R0** uniform-rendering model.
- **`docs/development/implementation-plan.md`** — low-level: the module map (file → block → exports), per-layer realization, pitfalls.
- **`docs/development/test-plan.md`** — the test strategy (currently a draft).
- **`docs/development/issues.md`** — the **backlog + lessons**. **OPEN** at the top: numbered registry items in the changelog's own per-category sequences — **open decisions** (`Decision N`), **planned features** (`Feature N`), **known open bugs** (`Bug N`) — each assigned its number when opened and **keeping it** when it ships (→ moves to the changelog); plus a **Meta level** of process/quality work (**verifications**, **refactoring**, **housekeeping**, and the hard-won **`Lesson 1–17`**) that stays here and is **unnumbered**. The **solved** Bug / Feature / Change / Decision entries (with cause + fix) live in **`CHANGELOG.md`** — see *Versioning, changelog & commits* below.
- **`docs/development/methodology.md`** — the core principles (DRY, KISS, elegance, think-first, ground-up), the abstraction-level model, and how we work.

## Build & Test

All commands run inside the devcontainer (podman). Never install or build on the host.

```bash
npm run build      # tsc -noEmit + esbuild production
npm run lint       # eslint src/  (the SHIPPED gate — kept exactly as-is, T9; do NOT add rules)
npm run lint:obsidian  # recreates the Obsidian community-plugin review (eslint-plugin-obsidianmd) — a SEPARATE dev-only pass, not the shipped gate. Scans ALL of src/ exactly like the bot (incl. the runtime + dev-bridge non-plugin bundles — Decision 29 un-excluded them; v0.6.1's exclusion HID a real failing error, Lesson 18) and mirrors the bot's severities. Must report 0 errors; ~11 documented warnings are expected (deprecations + the runtime `instanceof` / dev-bridge `net` off-Obsidian false positives — Decision 26/29).
npm run lint:css   # recreates the review's CSS scan (stylelint :has / !important) — warnings only, all reviewed/justified (Decision 26)
npm test           # vitest run
npm run dev        # esbuild watch mode
npm run dev:vault  # esbuild watch -> writes straight into the example-vault/ vault plugin dir (Developer Toolbox auto-reloads)
npm run check:watch  # tsc -noEmit --watch (live type errors in the terminal; esbuild does not type-check)
```

Install into a vault for testing:
```bash
./scripts/dev-install.sh ~/path/to/vault          # production build
./scripts/dev-install.sh ~/path/to/vault --dev    # debug build (inline source maps, not minified)
```

Build gotcha — `esbuild: Failed to write to output file: open /workspace/main.js: permission denied`: a pre-existing `main.js` couldn't be overwritten (verified fix: `rm -f main.js && npm run build`; likely cause — the file was owned by another uid, e.g. created on the host or by root, so the container user couldn't write it; not independently confirmed).

Fresh-devcontainer gotcha (verified 2026-06-03) — after the podman named volume is recreated, the `node_modules` binaries can land without the execute bit (and/or root-owned, non-readable): `esbuild … EACCES`, `vitest: Permission denied`, `Cannot find type definition file for 'node'`. **Do NOT** blanket-`chmod +x node_modules` — it can flip files to `711` root-owned (execute-only, so Node can no longer *read* `.mjs`/`.d.ts`), making it worse. Clean fix: `rm -rf node_modules && npm install` (network needed). Minimal fix when only the bundler is hit: `chmod +x node_modules/@esbuild/*/bin/esbuild`. The install script itself also loses its `+x` — invoke it as `bash scripts/dev-install.sh <vault>`. Use that script to install into a vault (it builds + copies `main.js`/`manifest.json`/`styles.css`) rather than copying by hand.

## Versioning, changelog & commits

After every **larger code change or fix**, bump the version and record it — this is part of finishing the work, not a release-only step. **Documentation-only changes do not bump the version** (and so get no changelog entry).

- **Version — patch bumps only.** Every release increments the **patch** component (`0.5.4 → 0.5.5 → … → 0.5.10 → …`); **never** bump the minor or major (no `0.5.x → 0.6.0`, no `→ 1.0.0`) — leaving 0.x is a deliberate, separate decision, not a per-change call, regardless of whether the batch contains features or only fixes. **Why:** changelog entries accumulate uncommitted between releases and several ship together, but a batch is still **one patch** — we don't want minor/major jumps in the git history. (Notation is SemVer `<major>.<minor>.<patch>`; pre-1.0 relaxed rules apply.) **`package.json` is the single source of truth; `manifest.json` and `versions.json` are *generated* from it — never hand-edit those.** Do it in three steps and don't skip the third:
  1. Edit `version` in `package.json` (the only file you touch by hand).
  2. Run `npm run version` — `version-bump.mjs` rewrites `manifest.json` and adds `versions.json[<version>] = minAppVersion`. This step is **mandatory**: editing `package.json` alone (or hand-editing only some of the files) leaves `manifest.json` stale — and `manifest.json` is the version Obsidian actually ships. That is exactly how the `0.4.0`/`0.4.1` drift happened.
  3. **Verify all three agree** before moving on: `grep -H '"version"' package.json manifest.json` (both must show the new version) and confirm `versions.json` has the new key. If they disagree, re-run step 2.
  - *Not* version sources — do **not** hand-edit these for a bump: `example-vault/.obsidian/plugins/live-image-editor/manifest.json` is a build artifact (regenerated by `npm run build` / `npm run dev:vault`), and the `x.y.z` strings in `README.md` are illustrative release-checklist examples.
- **Changelog** — record the work in `CHANGELOG.md` (the registry of everything done). Its **numbering policy, category taxonomy (`Decision`/`Change`/`Feature`/`Bug`) and per-version sort are the single source** in the headers of `CHANGELOG.md` + `docs/development/issues.md` — you read one of them to do the work anyway, so **follow those headers; don't restate them here**. (CLAUDE-local detail not in those headers: the bracketed `## [x.y.z] - YYYY-MM-DD` heading carries **no link definition** — per-version compare links aren't possible, not every version is tagged.)
  - **MANDATORY entry format — every change is one list entry, typed and numbered.** Each individual change is written as **exactly one** Markdown list item beginning `- **<Type> <N> — <title>.**` where `<Type>` is `Decision`/`Change`/`Feature`/`Bug` and `<N>` is its registry number (e.g. `- **Bug 94 — …**`). There is **no other way** to record a change: no ungrouped or grouped prose blocks ("Small fixes:", "A layout rework:", bulleted-but-unnumbered notes, etc.) — if it's a change, it gets its own typed, numbered list item. The **only** allowed prose is **one** short version-intro paragraph directly under the `## [x.y.z]` heading; nothing else sits between the heading and the next version. When several batches accumulate into one release, **merge their summaries into that single intro** and list every change as its own numbered item — never carry per-batch intro paragraphs into the section.
- **Commits** — commit **regularly**, and **always** on a version change. The agent **never commits itself**: it **reminds** the user when a commit is due (regular cadence; mandatory on a version bump); the user makes all git commits.

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

CDP gotchas — the quick actionable form here; the **full rationale is the single source** in `docs/development/issues.md` (**Lesson 4** never-disablePlugin, **Lesson 15** dev-process, **Lesson 16** the "verified" bar). Don't restate it — link it.

- `location.reload()` via `--eval` = clean full reload (the relay restarts with the plugin). **Never** `disablePlugin`/`enablePlugin` — stale registrations (→ **Lesson 4**).
- **Relay (9222) flaps after a plugin reload** (old socket in TIME_WAIT) — connect directly with `CDP_PORT=9223`; it survives `location.reload()`, and the relay reliably hits the main window once back (~20–30 s) (→ **Lesson 15**).
- **Stale-build trap** — two quick `dev:vault` saves can load an *intermediate* build (a `ReferenceError` that looks like "rendering broke"); force a clean `location.reload()` and verify via the console exception, not assumptions (→ **Lesson 15**).
- `--eval` returns an un-invoked arrow function as `{}` (wrap returns in `JSON.stringify(...)`); an **async** `--eval` likewise resolves to `{}` over the bridge — stash to `window.__X` and poll a sync read (→ **Lesson 16**).
