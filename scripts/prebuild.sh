#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Compose liest die .env aus dem Verzeichnis der Compose-Datei (.devcontainer/).
ENV_FILE="${ROOT_DIR}/.devcontainer/.env"

HOST_UID="$(id -u)"
VARIANT="22"

touch "${ENV_FILE}"

upsert() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    # vorhandenen Wert ersetzen (portabel: tmp-Datei statt sed -i)
    grep -vE "^${key}=" "${ENV_FILE}" > "${ENV_FILE}.tmp" || true
    mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  fi
  printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  echo "Updated ${ENV_FILE}: ${key}=${value}"
}

upsert USER_NAME "${USER}"
upsert USER_UID "${HOST_UID}"
upsert VARIANT "${VARIANT}"
