#!/usr/bin/env bash
# ============================================================
# STATUS — Carregador do submódulo de status
# ============================================================

_status_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Server Status: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_status_source "$DEV_DASHBOARD_DIR/lib/server/status/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-status dev-status-all dev-servers 2>/dev/null || true
fi