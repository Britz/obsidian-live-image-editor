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

## 2 — Draft the THREE messages, then ask for them in ONE popup (editable, per-tab)

Read the `## [VERSION]` CHANGELOG section and the commits since the last release
(`git log "$(git describe --tags --abbrev=0)"..HEAD --oneline` + `git diff --stat` of that range),
then draft all THREE final messages and present them in a **single `AskUserQuestion` popup** — one
question per message (so each is its own tab), each with your draft as the **recommended option** and
the implicit free-text "Other" as the editable field. The user approves each by button (pick the
draft) or edits it (type into "Other"); choosing nothing / dismissing = abort the release.

The three messages — each used **VERBATIM**, the script alters none of them (no `chore(release):
v<VERSION> — ` prefix, no `v<VERSION> - ` prefix, no reassembly):

- **Commit message** — the complete, final commit message. Include any `chore(release): v<VERSION> — `
  subject prefix yourself if you want one; whatever is approved is committed unchanged.
- **Tag message** — the complete, final annotated-tag message.
- **Release notes** — the complete, final GitHub-release body. Default draft = the tag message + a
  blank line + the `## [VERSION]` CHANGELOG section (since that's the usual body); the user can replace
  it. Passed to the script as arg 3 and used verbatim.

Before opening the popup, also `npm run build` is NOT needed here — the script builds; but you DO need
the asset sizes for the summary, so it's fine to have built already. Keep the drafts concise enough to
read in the option label.

## 3 — Summarize the assembled release (show, before opening the popup OR alongside it)

Show the complete picture (every message shown exactly as it'll be used — verbatim):
- version/tag (bare `x.y.z` from package.json, no leading `v`),
- the verbatim commit message,
- the verbatim tag message,
- the verbatim release notes,
- attached assets **with sizes**: `main.js`, `manifest.json`, `styles.css` (the script **builds
  first** — a build failure aborts before anything, and the sizes come from that fresh build),
- commit scope (how many paths `git add -A` will stage).

## 4 — The popup IS the gate, THEN run

The `AskUserQuestion` popup from step 2 is the approval gate: the user approves the three messages by
button or aborts. Once all three come back (approved drafts and/or edited text):

- **If the user approved (did not dismiss/abort)** → run it yourself, passing all three verbatim:
  ```bash
  RELEASE_ASSUME_YES=1 bash scripts/release.sh "<commit msg>" "<tag msg>" "<release notes>"
  ```
  (`RELEASE_ASSUME_YES=1` skips the script's own prompt because the popup already took approval.) The
  script self-verifies at the end (tag on origin, release + the three assets present) — report that
  result and the release URL, and surface any `✗` if a check failed.
- **If the user dismissed/aborted the popup** → do nothing. Run no build, commit, tag, push, or
  release. (They can also run `bash scripts/release.sh` themselves; with no args it prompts for the
  three messages and its own `y` gate.)

## Format reference (all three messages are used VERBATIM — the script prepends/alters nothing)

| Artifact | Result |
| --- | --- |
| commit | `<commit msg>` (verbatim — include any `chore(release): v<VERSION> — ` prefix yourself) |
| tag | name `<VERSION>` (no `v`), annotated message `<tag msg>` (verbatim) |
| release notes | `<release notes>` (verbatim arg 3; default draft = tag msg + blank line + CHANGELOG section) |
| assets | `main.js`, `manifest.json`, `styles.css` |
