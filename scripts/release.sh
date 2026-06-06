#!/usr/bin/env bash
# Release helper for Live Image Editor — assembles ONE versioned commit, an annotated tag, and the
# GitHub release (with the required plugin binaries attached) from two inputs: the commit message and
# the tag message. The VERSION is taken automatically from package.json (the single source of truth)
# — you never type it. Run inside the devcontainer (it builds + needs gh):
#
#   bash scripts/release.sh                       # interactive — prompts for commit + tag message
#   bash scripts/release.sh "<commit>" "<tag>"    # non-interactive (commit-msg tag-msg)
#
# What it produces (the version is auto-prepended — you supply the bare message only):
#   commit  : chore(release): v<VERSION> — <COMMIT-MSG>      (em-dash, matches the repo convention)
#   tag     : annotated, named <VERSION> (NO leading v), message  "v<VERSION> - <TAG-MSG>"
#   release : gh release on tag <VERSION>; notes = "v<VERSION> - <TAG-MSG>\n\n" + the CHANGELOG section;
#             assets main.js + manifest.json + styles.css attached as binaries (Obsidian SR rule).
#
# It BUILDS first (npm run build → generates main.js; a build failure aborts immediately), then
# summarises EVERYTHING (with the asset sizes) and waits for an explicit "y". Anything else aborts and
# touches NOTHING in git — no commit, no tag, no push, no release (only the git-ignored main.js
# artifact gets regenerated, which is harmless).
# (RELEASE_ASSUME_YES=1 skips the prompt — used by the /release skill, which already took an explicit
# confirmation in the chat; a human running this directly always gets the prompt.)
#
# Safety: refuses to run unless package.json == manifest.json (the SSOT — bump first with
# `npm run version`), the CHANGELOG has a matching section, and the tag does not already exist.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

die()   { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
step()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
hsize() { du -h "$1" 2>/dev/null | cut -f1 || echo '?'; }  # human-readable file size

command -v gh   >/dev/null || die "gh (GitHub CLI) not found — install it / open the devcontainer."
command -v node >/dev/null || die "node not found — run this inside the devcontainer."

# VERSION is NOT an input — it comes from package.json (the SSOT).
VERSION="$(node -p "require('./package.json').version")"
MANIFEST_VERSION="$(node -p "require('./manifest.json').version")"
COMMIT_MSG="${1:-}"; TAG_MSG="${2:-}"

# --- gather the two messages (prompt for anything not passed as an argument) ---
[ -z "$COMMIT_MSG" ] && { read -rp "Commit message (after 'chore(release): v${VERSION} — '): " COMMIT_MSG || true; }
[ -z "$TAG_MSG" ]    && { read -rp "Tag message (after 'v${VERSION} - '): " TAG_MSG || true; }

# --- validate (no mutations happen in this whole section) ---
[ -n "$COMMIT_MSG" ] && [ -n "$TAG_MSG" ] || die "commit message and tag message are both required."
printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || die "package.json version must be bare x.y.z — got '$VERSION'."
[ "$VERSION" = "$MANIFEST_VERSION" ] \
  || die "version mismatch: package.json=$VERSION but manifest.json=$MANIFEST_VERSION.
  Bump first: edit package.json, then 'npm run version' (see CLAUDE.md → Versioning)."
# Must be a FRESH release: no existing tag (local OR origin) and no GitHub release for this version.
git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null 2>&1 \
  && die "tag '$VERSION' already exists locally — delete it (git tag -d $VERSION) or bump the version."
git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1 \
  && die "tag '$VERSION' already exists on origin — this version was (partly) released already."
gh release view "$VERSION" >/dev/null 2>&1 \
  && die "a GitHub release '$VERSION' already exists — bump the version or delete the release first."

# CHANGELOG safety — the release notes are built from this section, so it must (1) exist, (2) be the
# NEWEST version entry, (3) carry a 'YYYY-MM-DD' date, and (4) have real content below the heading.
grep -qE "^## \[${VERSION}\]" CHANGELOG.md \
  || die "no '## [${VERSION}]' section in CHANGELOG.md — add the changelog entry first."
NEWEST="$(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
[ "$NEWEST" = "$VERSION" ] \
  || die "CHANGELOG.md's newest entry is [${NEWEST:-none}], not [${VERSION}] — the release version must be the TOP entry."
grep -qE "^## \[${VERSION}\] - [0-9]{4}-[0-9]{2}-[0-9]{2}([[:space:]]|$)" CHANGELOG.md \
  || die "the '## [${VERSION}]' heading needs a date: '## [${VERSION}] - YYYY-MM-DD'."
# Section text: from '## [VERSION]' up to (but not including) the next '## [' heading.
CHANGELOG_SECTION="$(sed -n "/## \[${VERSION}\]/,/## \[/p" CHANGELOG.md | sed '$d')"
CHANGELOG_BODY="$(printf '%s\n' "$CHANGELOG_SECTION" | sed '1d' | grep -vE '^[[:space:]]*$' || true)"
[ -n "$CHANGELOG_BODY" ] \
  || die "the '## [${VERSION}]' section has no content — fill in the changelog before releasing."

# --- BUILD FIRST — generates the release assets (main.js). A build failure aborts HERE, before the
#     summary and before any commit/tag/push/release. (npm run build = tsc -noEmit + esbuild prod.)
step "building (tsc + esbuild) — generates main.js…"
npm run build || die "build failed — aborting; nothing was committed, tagged, or released."

# --- assemble the summary strings (no git mutation happens until after you confirm, below) ---
COMMIT_FULL="chore(release): v${VERSION} — ${COMMIT_MSG}"
TAG_FULL="v${VERSION} - ${TAG_MSG}"
NOTES="$(printf 'v%s - %s\n\n%s\n' "$VERSION" "$TAG_MSG" "$CHANGELOG_SECTION")"
SCOPE_COUNT="$(git status --porcelain | wc -l | tr -d ' ')"

# --- FINAL SUMMARY + explicit confirmation gate (nothing above this mutated anything) ---
printf '\n══ RELEASE SUMMARY ════════════════════════════════════════════\n'
# single-line fields first; the potentially multi-line commit + notes go last.
printf '  version : %s   (from package.json; tag name is bare — no leading v)\n' "$VERSION"
printf '  assets  : main.js (%s), manifest.json (%s), styles.css (%s)\n' \
  "$(hsize main.js)" "$(hsize manifest.json)" "$(hsize styles.css)"
printf '  scope   : %s changed path(s) — ALL staged via `git add -A` (run `git status` for the list)\n' "$SCOPE_COUNT"
printf '  tag msg : %s\n' "$TAG_FULL"
printf '  commit  : %s\n' "$COMMIT_FULL"
printf '  notes   : "%s"\n            + the CHANGELOG [%s] section (%s lines)\n' \
  "$TAG_FULL" "$VERSION" "$(printf '%s\n' "$CHANGELOG_SECTION" | wc -l | tr -d ' ')"
printf '═══════════════════════════════════════════════════════════════\n'
printf 'then: commit → tag → push origin HEAD + %s → gh release create\n' "$VERSION"
if [ "${RELEASE_ASSUME_YES:-}" = "1" ]; then
  echo "RELEASE_ASSUME_YES=1 — confirmation already taken; proceeding."
else
  read -rp "Type 'y' to release (anything else aborts and does NOTHING): " ok || true
  [ "${ok:-}" = "y" ] || [ "${ok:-}" = "Y" ] || die "aborted — nothing was done (no commit, tag, push, or release)."
fi

# --- execute git + release (build already done above; only reached after explicit confirmation) ---
step "committing the release…"
git add -A
if git diff --cached --quiet; then
  echo "  (nothing new staged — assuming the release commit already exists; continuing to tag + release)"
else
  git commit -m "$COMMIT_FULL"
fi

step "tagging $VERSION…"
git tag -a "$VERSION" -m "$TAG_FULL"

step "pushing branch + tag…"
git push origin HEAD
git push origin "$VERSION"

step "creating the GitHub release with assets…"
gh release create "$VERSION" --title "$VERSION" --notes "$NOTES" main.js manifest.json styles.css

step "verifying the release went through…"
FAIL=0
git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1 \
  && echo "  ✓ tag $VERSION pushed to origin" || { echo "  ✗ tag $VERSION not on origin"; FAIL=1; }
if gh release view "$VERSION" >/dev/null 2>&1; then
  echo "  ✓ GitHub release $VERSION exists"
  ASSETS="$(gh release view "$VERSION" --json assets -q '.assets[].name' 2>/dev/null || true)"
  for a in main.js manifest.json styles.css; do
    printf '%s\n' "$ASSETS" | grep -qx "$a" \
      && echo "  ✓ asset $a attached" || { echo "  ✗ asset $a MISSING from the release"; FAIL=1; }
  done
else
  echo "  ✗ GitHub release $VERSION not found"; FAIL=1
fi
[ "$FAIL" = 0 ] || die "release verification FAILED — fix the ✗ items above (e.g. re-attach with 'gh release upload $VERSION <file>')."

printf '\033[32m✓ released v%s → %s\033[0m\n' "$VERSION" "$(gh release view "$VERSION" --json url -q .url)"
