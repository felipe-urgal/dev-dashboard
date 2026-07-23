#!/usr/bin/env bash
# ============================================================
# TESTS — Carregador dos submódulos de testes Rails
# ============================================================

_tests_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Tests: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_tests_source "$DEV_DASHBOARD_DIR/lib/rails/tests/helpers.sh"
_tests_source "$DEV_DASHBOARD_DIR/lib/rails/tests/run_all.sh"
_tests_source "$DEV_DASHBOARD_DIR/lib/rails/tests/run_selected.sh"
_tests_source "$DEV_DASHBOARD_DIR/lib/rails/tests/run_single.sh"
_tests_source "$DEV_DASHBOARD_DIR/lib/rails/tests/run_failures.sh"
_tests_source "$DEV_DASHBOARD_DIR/lib/rails/tests/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-testes 2>/dev/null || true
fi