#!/bin/bash
# Run on the HOST (macOS) — double-click in Finder, or run from a terminal.
#
# Launches Obsidian with Chrome DevTools remote debugging enabled, so the
# in-plugin dev relay (src/dev-bridge.ts, present in dev builds) can expose CDP
# to the devcontainer. There is no in-app UI toggle for this; it must be a
# launch flag, hence this launcher.
#
# It also opens the bundled example vault (vault-image-toolbar/) so the plugin is ready to
# debug immediately.
#
# Override defaults via env: CDP_PORT (default 9223), OBSIDIAN_APP (app path),
# VAULT (default: the repo's vault-image-toolbar/ vault).

set -e

PORT="${CDP_PORT:-9223}"
APP="${OBSIDIAN_APP:-/Applications/Obsidian.app}"
BIN="$APP/Contents/MacOS/Obsidian"

# The example vault ships with the debug config (.obsidian/) — resolve it relative
# to this script so it works wherever the repo is checked out on the host.
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="${VAULT:-$REPO_DIR/vault-image-toolbar}"

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

# The obsidian:// URI can only route to a vault Obsidian already knows. After the
# examples/ -> vault-image-toolbar/ rename (and on a fresh machine) this folder isn't a
# registered vault yet, so Obsidian answers "Unable to find a vault for the URL".
# Register it in Obsidian's global config now — additive + idempotent, and while
# Obsidian is quit so the relaunched instance reads it on startup. macOS config path.
if [ -d "$VAULT/.obsidian" ]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$VAULT" <<'PY' || echo "⚠ Could not auto-register the vault — open the folder once via Obsidian's 'Open folder as vault'."
import json, os, sys, time, hashlib, tempfile
vault = os.path.realpath(sys.argv[1])
cfg_dir = os.path.expanduser("~/Library/Application Support/obsidian")
cfg = os.path.join(cfg_dir, "obsidian.json")
try:
    with open(cfg) as f:
        data = json.load(f)
except (FileNotFoundError, ValueError):
    data = {}
if not isinstance(data, dict):
    data = {}
vaults = data.get("vaults")
if not isinstance(vaults, dict):
    vaults = data["vaults"] = {}
for v in vaults.values():
    if isinstance(v, dict) and os.path.realpath(os.path.expanduser(v.get("path", ""))) == vault:
        print("✓ Example vault already registered with Obsidian.")
        break
else:
    vid = hashlib.sha1(vault.encode()).hexdigest()[:16]
    vaults[vid] = {"path": vault, "ts": int(time.time() * 1000), "open": False}
    os.makedirs(cfg_dir, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=cfg_dir)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    os.replace(tmp, cfg)
    print("✓ Registered the example vault with Obsidian (added to obsidian.json).")
PY
  else
    echo "⚠ python3 not found — can't auto-register the example vault. Open '$VAULT' once via Obsidian's 'Open folder as vault'."
  fi
fi

echo "Launching Obsidian with --remote-debugging-port=$PORT --remote-allow-origins=* ..."
# Detach so closing this window doesn't kill Obsidian.
nohup "$BIN" --remote-debugging-port="$PORT" --remote-allow-origins='*' >/dev/null 2>&1 &
disown 2>/dev/null || true

# Once it's up, open the example vault in this (debug-flagged) instance via the
# obsidian:// URI. A launch-flagged instance is already running, so `open` just
# routes the URI to it rather than starting a second, unflagged process.
if [ -d "$VAULT/.obsidian" ]; then
  # Open by vault NAME (folder basename) — the documented, reliable URI form once the
  # vault is registered (above). URL-encode it for the URI.
  VAULT_NAME="$(basename "$VAULT")"
  if command -v python3 >/dev/null 2>&1; then
    VAULT_ENC="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$VAULT_NAME")"
  else
    VAULT_ENC="$(printf '%s' "$VAULT_NAME" | sed 's/ /%20/g')"
  fi
  echo "Opening example vault: $VAULT"
  ( sleep 2; open "obsidian://open?vault=$VAULT_ENC" ) &
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
