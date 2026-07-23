#!/usr/bin/env bash
# ============================================================
# NODE SCRIPTS — Carregador do submódulo de scripts
# ============================================================
_node_scripts_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node Scripts: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_node_scripts_source "$DEV_DASHBOARD_DIR/lib/node/scripts/helpers.sh"
_node_scripts_source "$DEV_DASHBOARD_DIR/lib/node/scripts/run.sh"
