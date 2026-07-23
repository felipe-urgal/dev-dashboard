#!/usr/bin/env bash
# ============================================================
# UI — Carregador do módulo de interface
# ============================================================

_ui_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "UI: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_ui_source "$DEV_DASHBOARD_DIR/lib/ui/helpers.sh"
_ui_source "$DEV_DASHBOARD_DIR/lib/ui/header.sh"
_ui_source "$DEV_DASHBOARD_DIR/lib/ui/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f _dev_show_project_header project-menu dev-project-actions 2>/dev/null || true
fi