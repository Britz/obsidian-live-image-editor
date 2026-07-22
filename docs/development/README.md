# Development Docs

The design docs for **Live Image Editor** — one source of truth per altitude. Each artifact
sits at a fixed level of abstraction; ground any research or change on the artifact at the
right altitude, not on prose elsewhere. ([`CLAUDE.md`](https://github.com/Britz/obsidian-live-image-editor/blob/main/CLAUDE.md)
is the build & debug guide only; the [user guide](../user-guide.md) covers usage.)

## Read in this order (high → low altitude)

| Artifact | Altitude | What it answers |
| --- | --- | --- |
| [methodology.md](methodology.md) | Process | The core principles / R0 (think-first, ground-up, elegance — served by DRY & KISS), the abstraction-level model, and how the levels derive from one another. The foundation everything else aligns to. |
| [requirements.md](requirements.md) | What | The **F/D/T** requirements (functional / design / technical): what it does, how it looks, how it must be built. Coding conventions live in the T-items. |
| [architecture.md](architecture.md) | How (concept) | Mid-level decisions (`AD…`) and building blocks (`AB…`); data flow; the **uniform-rendering model**. |
| [implementation-plan.md](implementation-plan.md) | How (code) | Low-level module map (file → block → exports), per-layer realization, and pitfalls. |
| [test-plan.md](test-plan.md) | Verification | The test strategy (currently a draft). |
| [release-compliance.md](release-compliance.md) | Shippability | The **community-directory submission gate**, parallel to the test plan (test plan = behaviour, this = shippability): the `R1–R30` audit against Obsidian's Developer policies / Plugin guidelines / Submission requirements, plus the manual submission checklist. |
| [issues.md](issues.md) | Backlog + lessons | **OPEN** at the top: numbered registry items (`Decision`/`Feature`/`Bug`, sharing the changelog's sequences — each keeps its number when it ships) + an unnumbered **Meta level** (verifications, refactoring, housekeeping, and the hard-won **`Lesson 1–16`**). The solved Bug/Feature/Change/Decision registry lives in [CHANGELOG.md](../../CHANGELOG.md). |
| [CHANGELOG.md](../../CHANGELOG.md) | Done | The registry of everything shipped: **one numbered list per version**, sorted Decision › Change › Feature › Bug (newest-first), each entry in its own global chronological sequence (numbers never reused). |

The pre-submission **community-directory compliance audit** — the plugin checked against Obsidian's
Developer policies, Plugin guidelines, and Submission requirements (2026-06-05) — lives in
[release-compliance.md](release-compliance.md): the full pass/fail record (rules `R1–R30`, with
sources) plus the manual submission checklist (the former standalone `rc-issues.md`'s `RC1–RC11`).
Its open `R…` rules link into the matching task-type sections of `issues.md`, where each is an
actionable **[Release-Requirement]** item.

## Conventions

- Cross-references between these files use the bare filename (e.g. `requirements.md`); they all
  live in this folder, so the links resolve as siblings.
- Requirement tags: **Fn / Dn / Tn** (requirements), **ADn / ABn** (architecture), **Ln**
  (lessons in `issues.md`).

## Developing

The full build & debug guide is
[`CLAUDE.md`](https://github.com/Britz/obsidian-live-image-editor/blob/main/CLAUDE.md); the
essentials:

**1 — Open the devcontainer in VS Code.** Clone the repo, open it in **VS Code**, then run
*Dev Containers: Reopen in Container* (the Dev Containers extension; the container runs on
podman). Every build, test and lint runs **inside** the container — never on the host.

**2 — Build & watch.** In the container's terminal:

```bash
npm install         # first time only
npm run build       # type-check + production bundle (main.js + lie-runtime.js)
npm run dev:vault   # watch build, written straight into vault-image-toolbar/.obsidian/plugins/…
npm test            # vitest (pure *-logic.ts units)
npm run lint        # eslint
```

`npm run dev:vault` rebuilds into the bundled `vault-image-toolbar/` demo vault (a real Obsidian
vault — open that folder in Obsidian). A JS change needs a manual reload (CDP `location.reload()`);
styles.css/manifest changes reload automatically. To install into your own vault instead:
`bash scripts/dev-install.sh ~/path/to/vault --dev`.

`npm run dev` is the plain esbuild watch (writes `main.js` to the repo root, no type-check). For a
one-off **build from source**, run `npm run build` and copy `main.js`, `manifest.json` and
`styles.css` into your vault's `.obsidian/plugins/live-image-editor/` (or use `dev-install.sh`
without `--dev` for a production build).

**3 — Run Obsidian in dev mode (live debugging).** A dev build exposes Obsidian's Chrome
DevTools Protocol, so you can tail its console and evaluate code in the running plugin from
inside the container. On the **host (macOS)**, launch Obsidian with the debug flags using the
double-clickable launcher:

```bash
scripts/obsidian-dev.command    # quits & relaunches Obsidian with --remote-debugging-port
```

Then, with a dev build enabled (`npm run dev:vault`), from the container:

```bash
node scripts/obsidian-debug.mjs --list     # list debuggable targets
node scripts/obsidian-debug.mjs            # tail console + exceptions
```

See `CLAUDE.md` → *Live debugging in Obsidian (CDP)* for the full setup and the known gotchas.

## Docs site (ProperDocs + MaterialX — local preview & deploy)

The documentation site at
[britz.github.io/obsidian-live-image-editor](https://britz.github.io/obsidian-live-image-editor/) is
published from `docs/` and built in CI by
[`.github/workflows/docs.yml`](https://github.com/Britz/obsidian-live-image-editor/blob/main/.github/workflows/docs.yml).

**Toolchain — ProperDocs, not MkDocs.** The site runs on **ProperDocs** (the maintained MkDocs 1.x
drop-in fork) with the **MaterialX** theme (the community continuation of mkdocs-material). The
original MkDocs is abandoned and the incoming "MkDocs 2.0" drops plugin support / switches to TOML,
breaking Material + every plugin; mkdocs-material itself is maintenance-only (feature-frozen Nov
2025, critical fixes ~until Nov 2026). The full rationale and the rejected alternatives (incl. `mike`)
are recorded in [issues.md](issues.md) → **Decision 11**. **Build with `properdocs`, never `mkdocs`** —
both binaries exist in the venv (`mkdocs` is the dormant 1.x engine MaterialX pins below 2.0).

**Local preview.** Install the pinned toolchain from
[`.github/requirements-docs.txt`](https://github.com/Britz/obsidian-live-image-editor/blob/main/.github/requirements-docs.txt)
(kept out of the repo root so it isn't mistaken for the project's npm dependencies — those live in
`package.json`) and run, **from the repo root**:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r .github/requirements-docs.txt
.venv-docs/bin/properdocs serve              # live preview at http://127.0.0.1:8000
.venv-docs/bin/properdocs build --strict     # optional: fail on broken links / missing files
```

VS Code users can run these via the **"ProperDocs:" tasks**
([`.vscode/tasks.json`](https://github.com/Britz/obsidian-live-image-editor/blob/main/.vscode/tasks.json):
serve / build / strict-check), with matching debug configs in
[`.vscode/launch.json`](https://github.com/Britz/obsidian-live-image-editor/blob/main/.vscode/launch.json).
This toolchain is independent of the devcontainer's Node build above — it needs only Python 3 on the
host (or wherever you preview the docs).

**Deploy & versioning.** On every push to `main` that touches the docs (or `src/`, for the embedded
runtime), CI builds the standalone runtime (`lie-runtime.js`) into `docs/assets/` and runs
**`properdocs gh-deploy`**, which force-pushes the built site to the **`gh-pages` branch**; GitHub
Pages serves that branch (Settings → Pages → *Deploy from a branch* → `gh-pages` / `/ (root)` — the
branch exists only after the first deploy). It is a **single-version** site (no `mike`). The release
the site was compiled from is shown by the **native header repository link** — the latest **GitHub
Release** tag, fetched live from the GitHub API — so a bare git tag won't show: **publish a Release**
(tag = version, no `v` prefix).
