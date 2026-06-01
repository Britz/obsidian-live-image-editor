#!/bin/bash
# Run on the HOST (macOS) — double-click in Finder, or run from a terminal.
#
# Launches Obsidian with Chrome DevTools remote debugging enabled, so the
# in-plugin dev relay (src/dev-bridge.ts, present in dev builds) can expose CDP
# to the devcontainer. There is no in-app UI toggle for this; it must be a
# launch flag, hence this launcher.
#
# It also opens the bundled example vault (examples/) so the plugin is ready to
# debug immediately.
#
# Override defaults via env: CDP_PORT (default 9223), OBSIDIAN_APP (app path),
# VAULT (default: the repo's examples/ vault).

set -e

PORT="${CDP_PORT:-9223}"
APP="${OBSIDIAN_APP:-/Applications/Obsidian.app}"
BIN="$APP/Contents/MacOS/Obsidian"

# The example vault ships with the debug config (.obsidian/) — resolve it relative
# to this script so it works wherever the repo is checked out on the host.
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="${VAULT:-$REPO_DIR/examples}"

if [ ! -x "$BIN" ]; then
  echo "✗ Obsidian binary not found at: $BIN"
  echo "  Set OBSIDIAN_APP to your Obsidian.app path and retry."
  exit 1
fi

# A running instance ignores new launch flags, so quit it first.
if pgrep -x Obsidian >/dev/null 2>&1; then
  echo "Quitting running Obsidian so the debug flags take effect..."
  osascript -e 'quit app "Obsidian"' 2>/dev/null || true
  for _ in $(seq 1 12); do
    pgrep -x Obsidian >/dev/null 2>&1 || break
    sleep 0.5
  done
fi

echo "Launching Obsidian with --remote-debugging-port=$PORT --remote-allow-origins=* ..."
# Detach so closing this window doesn't kill Obsidian.
nohup "$BIN" --remote-debugging-port="$PORT" --remote-allow-origins='*' >/dev/null 2>&1 &
disown 2>/dev/null || true

# Once it's up, open the example vault in this (debug-flagged) instance via the
# obsidian:// URI. A launch-flagged instance is already running, so `open` just
# routes the URI to it rather than starting a second, unflagged process.
if [ -d "$VAULT/.obsidian" ]; then
  # URL-encode the absolute path (spaces etc.) for the URI.
  if command -v python3 >/dev/null 2>&1; then
    VAULT_ENC="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$VAULT")"
  else
    VAULT_ENC="$(printf '%s' "$VAULT" | sed 's/ /%20/g')"
  fi
  echo "Opening example vault: $VAULT"
  ( sleep 2; open "obsidian://open?path=$VAULT_ENC" ) &
  disown 2>/dev/null || true
else
  echo "⚠ Example vault not found at $VAULT (no .obsidian/) — skipping auto-open."
fi

echo
echo "✓ Obsidian is starting."
echo "  Make sure a DEV build of the plugin is enabled (npm run dev:vault, or"
echo "  dev-install.sh <vault> --dev). In Obsidian's console (Cmd+Opt+I) you"
echo "  should then see:  [lie-dev-bridge] CDP relay 0.0.0.0:9222 -> 127.0.0.1:$PORT"
echo
echo "  From the devcontainer:  node scripts/obsidian-debug.mjs --list"
