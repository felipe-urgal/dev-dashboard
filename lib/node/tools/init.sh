#!/usr/bin/env bash
# ============================================================
# NODE TOOLS — Carregador do submódulo de ferramentas
# ============================================================
_node_tools_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node Tools: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_node_tools_source "$DEV_DASHBOARD_DIR/lib/node/tools/helpers.sh"
_node_tools_source "$DEV_DASHBOARD_DIR/lib/node/tools/run.sh"
