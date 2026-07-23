#!/usr/bin/env bash
# ============================================================
# LOGS — Carregador do submódulo de logs
# ============================================================

_logs_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Server Logs: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_logs_source "$DEV_DASHBOARD_DIR/lib/server/logs/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-logs 2>/dev/null || true
fi