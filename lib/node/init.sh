#!/usr/bin/env bash
# ============================================================
# NODE — Cliente Terminal dos contratos atuais
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

declare -f _runtime_api >/dev/null 2>&1 || _node_source "$DEV_DASHBOARD_DIR/lib/runtime/api.sh"
_node_source "$DEV_DASHBOARD_DIR/lib/node/menu/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-node-menu 2>/dev/null || true
fi
