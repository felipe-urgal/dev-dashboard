#!/usr/bin/env bash
# ============================================================
# RAILS MENU — Carregador do submódulo Menu
# ============================================================
_rails_menu_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails Menu: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_rails_menu_source "$DEV_DASHBOARD_DIR/lib/rails/menu/helpers.sh"
_rails_menu_source "$DEV_DASHBOARD_DIR/lib/rails/menu/run.sh"
if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu 2>/dev/null || true
fi