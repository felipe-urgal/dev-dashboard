#!/usr/bin/env bash
# ============================================================
# NODE DEPS — Carregador do submódulo de dependências
# ============================================================
_node_deps_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node Deps: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_node_deps_source "$DEV_DASHBOARD_DIR/lib/node/deps/helpers.sh"
_node_deps_source "$DEV_DASHBOARD_DIR/lib/node/deps/run.sh"
