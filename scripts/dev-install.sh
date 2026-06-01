#!/bin/bash
set -e

# Usage: dev-install.sh <vault-path> [--dev]
#   --dev  Install a debug build (inline source maps, not minified) instead of
#          the production build. Use this when debugging in Obsidian's DevTools.

VAULT_PATH=""
DEV=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    *) VAULT_PATH="$arg" ;;
  esac
done

: "${VAULT_PATH:?Usage: $0 <vault-path> [--dev]}"
VAULT_PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/live-image-editor"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$DEV" -eq 1 ]; then
  BUILD_CMD="build:dev"
  echo "Mode: dev (debug build with source maps)"
else
  BUILD_CMD="build"
  echo "Mode: production"
fi

if command -v podman > /dev/null 2>&1; then
  # Running on the host: spin up the devcontainer and build inside it.
  echo "Building in devcontainer..."
  npx --yes @devcontainers/cli up --workspace-folder "$SCRIPT_DIR" --docker-path podman > /dev/null 2>&1
  npx --yes @devcontainers/cli exec --workspace-folder "$SCRIPT_DIR" --docker-path podman npm run "$BUILD_CMD"
else
  # Already inside the devcontainer (no podman): build directly.
  echo "Building (inside devcontainer)..."
  ( cd "$SCRIPT_DIR" && npm run "$BUILD_CMD" )
fi

echo "Installing to $VAULT_PLUGIN_DIR..."
mkdir -p "$VAULT_PLUGIN_DIR"
cp "$SCRIPT_DIR/main.js" "$VAULT_PLUGIN_DIR/"
cp "$SCRIPT_DIR/manifest.json" "$VAULT_PLUGIN_DIR/"
cp "$SCRIPT_DIR/styles.css" "$VAULT_PLUGIN_DIR/"

echo "Done. Reload Obsidian or disable/enable the plugin."
