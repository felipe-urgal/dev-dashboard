#!/usr/bin/env bash
# ============================================================
# DASHBOARD — Carregador do módulo Dashboard
# ============================================================

_dashboard_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Dashboard: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_dashboard_source "$DEV_DASHBOARD_DIR/lib/dashboard/header.sh"
_dashboard_source "$DEV_DASHBOARD_DIR/lib/dashboard/router.sh"
_dashboard_source "$DEV_DASHBOARD_DIR/lib/dashboard/loop.sh"
_dashboard_source "$DEV_DASHBOARD_DIR/lib/dashboard/entry.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-tools dev-dashboard dev-run-command 2>/dev/null || true
fi