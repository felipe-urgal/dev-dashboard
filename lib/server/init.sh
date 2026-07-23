#!/usr/bin/env bash
# ============================================================
# SERVER — Carregador dos submódulos de servidor
# ============================================================

_server_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Server: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_server_source "$DEV_DASHBOARD_DIR/lib/server/core/init.sh"
_server_source "$DEV_DASHBOARD_DIR/lib/server/logs/init.sh"
_server_source "$DEV_DASHBOARD_DIR/lib/server/status/init.sh"
_server_source "$DEV_DASHBOARD_DIR/lib/server/health/init.sh"

# As funções públicas são exportadas pelos init.sh de cada submódulo