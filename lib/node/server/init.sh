#!/usr/bin/env bash
# ============================================================
# NODE SERVER — Carregador do submódulo servidor
# ============================================================

_node_server_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node Server: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_node_server_source "$DEV_DASHBOARD_DIR/lib/node/server/helpers.sh"
_node_server_source "$DEV_DASHBOARD_DIR/lib/node/server/start.sh"
_node_server_source "$DEV_DASHBOARD_DIR/lib/node/server/stop.sh"
_node_server_source "$DEV_DASHBOARD_DIR/lib/node/server/logs.sh"
_node_server_source "$DEV_DASHBOARD_DIR/lib/node/server/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-node-menu-servidor 2>/dev/null || true
fi