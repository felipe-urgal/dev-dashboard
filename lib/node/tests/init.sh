#!/usr/bin/env bash
# ============================================================
# NODE TESTS — Carregador do submódulo testes
# ============================================================

_node_tests_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Node Tests: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_node_tests_source "$DEV_DASHBOARD_DIR/lib/node/tests/helpers.sh"
_node_tests_source "$DEV_DASHBOARD_DIR/lib/node/tests/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-node-menu-testes 2>/dev/null || true
fi