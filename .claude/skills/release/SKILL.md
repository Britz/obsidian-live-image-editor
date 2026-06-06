---
name: release
description: Cut a release of the Live Image Editor plugin — verifies the version, generates editable commit & tag messages, summarizes, and (only after the user explicitly confirms) runs the release: versioned commit + annotated tag + GitHub release with main.js/manifest.json/styles.css attached. Use when the user wants to release, publish, tag, or ship a new plugin version.
---

# Release

Drives a full plugin release through `scripts/release.sh`.

> **Commit-rule exception (user-sanctioned).** CLAUDE.md says the agent never commits. The repo owner
> has explicitly carved out THIS skill: inside `/release` you MAY run the commit/tag/push/release —
> **but only after** you've shown the full summary and the user has **explicitly confirmed in the
> chat** that it's all correct. Never run it on your own, never without that explicit confirmation,
> and never outside this skill.

The version is **not** an input — it's `package.json`'s `version` (the single source of truth). The
user only provides the two messages.

## 1 — Pre-flight (read-only; stop on any failure and explain the fix)

- `VERSION` = `package.json` `version`. Confirm it **equals** `manifest.json`'s `version`. If they
  differ → STOP: the user must bump first (edit `package.json`, then `npm run version`).
- Confirm `CHANGELOG.md` has a `## [VERSION]` section that is the **newest** entry, carries a date
  (`## [VERSION] - YYYY-MM-DD`), and has real content. If not → STOP (the notes are built from it).
- Confirm it's a fresh release: **no existing tag** (local or on origin) and **no GitHub release**
  for VERSION. If any exists → STOP (bump the version, or delete the stale tag/release first).
- Confirm `gh` is available and authenticated (`gh auth status`).

## 2 — Generate EDITABLE message suggestions (offer, don't impose)

Read the `## [VERSION]` CHANGELOG section and the commits since the last release
(`git log "$(git describe --tags --abbrev=0)"..HEAD --oneline` + `git diff --stat` of that range),
then PROPOSE two messages and present them as editable suggestions (accept / edit / replace):

- **Commit message** — a short conventional one-line summary. The **bare part only** — do NOT include
  the `chore(release): v<VERSION> — ` prefix (the script adds it).
- **Tag message** — a one-line release summary (the bare part after `v<VERSION> - `; may mirror the
  commit summary).

Say explicitly both are editable. Wait for the user's final text.

## 3 — Summarize the assembled release (show, before asking to run)

Show the complete picture:
- version/tag (bare `x.y.z` from package.json, no leading `v`),
- full commit subject: `chore(release): v<VERSION> — <commit msg>`,
- full tag message: `v<VERSION> - <tag msg>`,
- release-notes preview: that tag line + a blank line + the `## [VERSION]` CHANGELOG section,
- attached assets **with sizes**: `main.js`, `manifest.json`, `styles.css` (the script **builds
  first** — a build failure aborts before anything, and the sizes come from that fresh build),
- commit scope (how many paths `git add -A` will stage).

## 4 — Explicit confirmation, THEN run

Ask the user to **explicitly confirm** that everything is correct and that you should run the release
now (a clear yes — treat anything ambiguous or anything other than a clear yes as "no").

- **If the user explicitly confirms** → run it yourself:
  ```bash
  RELEASE_ASSUME_YES=1 bash scripts/release.sh "<commit msg>" "<tag msg>"
  ```
  (`RELEASE_ASSUME_YES=1` skips the script's own prompt because the explicit confirmation already
  happened here.) The script self-verifies at the end (tag on origin, release + the three assets
  present) — report that result and the release URL, and surface any `✗` if a check failed.
- **If the user does NOT explicitly confirm** → do nothing. Run no build, commit, tag, push, or
  release. (They can also run `bash scripts/release.sh` themselves; with no args it prompts for the
  two messages and its own `y` gate.)

## Format reference (the script prepends the version — you only supply the bare messages)

| Artifact | Result |
| --- | --- |
| commit | `chore(release): v<VERSION> — <commit msg>` |
| tag | name `<VERSION>` (no `v`), annotated message `v<VERSION> - <tag msg>` |
| release notes | `v<VERSION> - <tag msg>` + blank line + the `## [VERSION]` CHANGELOG section |
| assets | `main.js`, `manifest.json`, `styles.css` |
