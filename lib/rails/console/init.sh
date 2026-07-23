#!/usr/bin/env bash
# ============================================================
# CONSOLE — Carregador dos submódulos de console Rails
# ============================================================

_console_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Console: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_console_source "$DEV_DASHBOARD_DIR/lib/rails/console/development.sh"
_console_source "$DEV_DASHBOARD_DIR/lib/rails/console/test.sh"
_console_source "$DEV_DASHBOARD_DIR/lib/rails/console/production.sh"
_console_source "$DEV_DASHBOARD_DIR/lib/rails/console/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-console 2>/dev/null || true
fi