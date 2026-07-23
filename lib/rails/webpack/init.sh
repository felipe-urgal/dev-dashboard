#!/usr/bin/env bash
# ============================================================
# WEBPACK — Carregador dos submódulos Webpack
# ============================================================

_webpack_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Webpack: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_webpack_source "$DEV_DASHBOARD_DIR/lib/rails/webpack/helpers.sh"
_webpack_source "$DEV_DASHBOARD_DIR/lib/rails/webpack/start.sh"
_webpack_source "$DEV_DASHBOARD_DIR/lib/rails/webpack/stop.sh"
_webpack_source "$DEV_DASHBOARD_DIR/lib/rails/webpack/logs.sh"
_webpack_source "$DEV_DASHBOARD_DIR/lib/rails/webpack/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-webpack 2>/dev/null || true
fi