#!/usr/bin/env bash
# ============================================================
# NODE MENU — Carregador do menu principal
# ============================================================

_node_menu_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node Menu: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_node_menu_source "$DEV_DASHBOARD_DIR/lib/node/menu/helpers.sh"
_node_menu_source "$DEV_DASHBOARD_DIR/lib/node/menu/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-node-menu 2>/dev/null || true
fi