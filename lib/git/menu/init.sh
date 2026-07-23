#!/usr/bin/env bash
# ============================================================
# MENU — Carregador do submódulo Menu
# ============================================================

_git_menu_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Menu: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_menu_source "$DEV_DASHBOARD_DIR/lib/git/menu/helpers.sh"
_git_menu_source "$DEV_DASHBOARD_DIR/lib/git/menu/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-menu-select 2>/dev/null || true
fi