#!/usr/bin/env bash
# ============================================================
# NODE — Carregador dos submódulos Node
# ============================================================

_node_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_node_source "$DEV_DASHBOARD_DIR/lib/node/menu/init.sh"
_node_source "$DEV_DASHBOARD_DIR/lib/node/server/init.sh"
_node_source "$DEV_DASHBOARD_DIR/lib/node/tests/init.sh"
_node_source "$DEV_DASHBOARD_DIR/lib/node/deps/init.sh"
_node_source "$DEV_DASHBOARD_DIR/lib/node/scripts/init.sh"
_node_source "$DEV_DASHBOARD_DIR/lib/node/tools/init.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-node-menu 2>/dev/null || true
fi