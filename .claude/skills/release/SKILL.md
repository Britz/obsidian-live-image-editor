---
name: release
description: Cut a release of the Live Image Editor plugin — verifies the version, drafts the commit/tag/release-notes messages, shows the WHOLE release as one summary in the chat, and (only after the user replies YES/JA) runs the release: versioned commit + annotated tag + GitHub release with main.js/manifest.json/styles.css attached. Use when the user wants to release, publish, tag, or ship a new plugin version.
---

# Release

Drives a full plugin release through `scripts/release.sh`.

> **Commit-rule exception (user-sanctioned).** CLAUDE.md says the agent never commits. The repo owner
> has explicitly carved out THIS skill: inside `/release` you MAY run the commit/tag/push/release —
> **but only after you show the full summary in the chat and the user replies `YES` / `JA`** (step 4).
> That reply is the ONLY release authorization. Never run it on your own, never without that reply,
> never outside this skill.

The version is **not** an input — it's `package.json`'s `version` (the single source of truth). You
draft the three messages (commit, tag, release notes); the user approves them as part of the one
final summary, or asks for edits.

**No extra files, ever.** Do NOT create a plan file, a temp file, a `.release-msg` file, or any other
side artifact — they risk being swept into the `git add -A` release commit, and the user does not want
them. Everything happens in the chat: the messages are drafted in your reply, shown in the summary,
and passed straight to the script as arguments.

## 1 — Pre-flight (read-only; stop on any failure and explain the fix)

- `VERSION` = `package.json` `version`. Confirm it **equals** `manifest.json`'s `version`. If they
  differ → STOP: the user must bump first (edit `package.json`, then `npm run version`).
- Confirm `CHANGELOG.md` has a `## [VERSION]` section that is the **newest** entry, carries a date
  (`## [VERSION] - YYYY-MM-DD`), and has real content. If not → STOP (the notes are built from it).
- Confirm it's a fresh release: **no existing tag** (local or on origin) and **no GitHub release**
  for VERSION. If any exists → STOP (bump the version, or delete the stale tag/release first).
- Confirm `gh` is available and authenticated (`gh auth status`).

## 2 — Draft the THREE messages

Read the `## [VERSION]` CHANGELOG section and the commits since the last release
(`git log "$(git describe --tags --abbrev=0)"..HEAD --oneline` + `git diff --stat` of that range),
then draft all THREE final messages. The content roles are FIXED (the user already decided them):

- **Commit message** — the **long / detailed** message. Include the full subject yourself (e.g. a
  `chore(release): v<VERSION> — …` prefix) — it is used verbatim, the script prepends nothing.
- **Tag message** — the **short** one-liner.
- **Release notes** — the **tag line + the `## [VERSION]` CHANGELOG section** (the script default).

Each message is used **VERBATIM** — the script alters none of them (no `chore(release): v<VERSION> — `
prefix, no `v<VERSION> - ` prefix, no reassembly). The release-notes message is passed to the script as
arg 3; leaving it as the default maps to an empty arg 3 (the script then rebuilds the same tag +
CHANGELOG body itself).

## 3 — Build, so the summary has real asset sizes

Run `npm run build` (tsc + esbuild → regenerates `main.js`). A build failure STOPS the release here,
before the summary. Read the byte sizes of `main.js`, `manifest.json`, `styles.css` for the summary.
(The script builds again itself; this build is just to populate the summary with accurate sizes.)

## 4 — THE GATE: show the full summary in the chat, wait for `YES` / `JA`

Print the **complete release summary** in the chat — everything, in full, readable end to end:
- version / tag (bare `x.y.z`, no leading `v`),
- the **complete** commit message,
- the **complete** tag message,
- the **complete** release notes (the body that will be posted) — shown **in full**, including the
  whole `## [VERSION]` CHANGELOG section verbatim, NOT just a reference to it,
- assets **with sizes**: `main.js`, `manifest.json`, `styles.css`,
- commit scope: how many paths `git add -A` stages — and a clear warning that `-A` sweeps the
  **ENTIRE** working tree into the release commit, not just the release files (tell the user to run
  `git status` if unsure),
- the action sequence: commit → tag `<VERSION>` → push origin HEAD + tag → `gh release create`.

Then ask the user to reply **`YES` or `JA`** to release.

> **MANDATORY — the YES/JA reply is the ONLY authorization.** Release **only** if the user's reply is a
> clear `YES` / `JA` (case-insensitive; a bare affirmative). **Anything else does NOT release** — a
> different word, a question, silence, an edit request, "looks good but…", etc. all mean **abort or
> revise**, never release. If the reply asks for a change, revise the message(s) and show the summary
> again — do NOT release on the strength of an earlier reply.

- **On a clear `YES` / `JA`** → run it yourself, passing all three messages verbatim:
  ```bash
  RELEASE_ASSUME_YES=1 bash scripts/release.sh "<commit msg>" "<tag msg>" "<release notes>"
  ```
  (`RELEASE_ASSUME_YES=1` skips the script's own `y` prompt — the chat YES/JA already replaced it.)
  The script builds, then self-verifies at the end (tag on origin, release + the three assets present)
  — report that result and the release URL, and surface any `✗` if a check failed.
- **On anything else** → do nothing (no build-for-release, commit, tag, push, or release). Revise if
  they asked for changes; otherwise stop. (The user can also run `bash scripts/release.sh` themselves;
  with no args it prompts for the three messages and its own `y` gate.)

## Format reference (all three messages are used VERBATIM — the script prepends/alters nothing)

| Artifact | Result |
| --- | --- |
| commit | `<commit msg>` (verbatim — include any `chore(release): v<VERSION> — ` prefix yourself) |
| tag | name `<VERSION>` (no `v`), annotated message `<tag msg>` (verbatim) |
| release notes | `<release notes>` (verbatim arg 3; default = tag msg + blank line + CHANGELOG section → pass empty arg 3) |
| assets | `main.js`, `manifest.json`, `styles.css` |
