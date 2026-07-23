#!/usr/bin/env bash
# ============================================================
# ASSETS — Carregador dos submódulos de assets
# ============================================================

_assets_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Assets: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_assets_source "$DEV_DASHBOARD_DIR/lib/rails/assets/build_js.sh"
_assets_source "$DEV_DASHBOARD_DIR/lib/rails/assets/build_css.sh"
_assets_source "$DEV_DASHBOARD_DIR/lib/rails/assets/build_all.sh"
_assets_source "$DEV_DASHBOARD_DIR/lib/rails/assets/watch_css.sh"
_assets_source "$DEV_DASHBOARD_DIR/lib/rails/assets/precompile.sh"
_assets_source "$DEV_DASHBOARD_DIR/lib/rails/assets/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-assets 2>/dev/null || true
fi