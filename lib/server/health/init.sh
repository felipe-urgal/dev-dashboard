#!/usr/bin/env bash
# ============================================================
# SERVER/HEALTH — Carregador do submódulo de saúde
# ============================================================
_server_health_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Server Health: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_server_health_source "$DEV_DASHBOARD_DIR/lib/server/health/helpers.sh"
_server_health_source "$DEV_DASHBOARD_DIR/lib/server/health/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-health 2>/dev/null || true
fi
