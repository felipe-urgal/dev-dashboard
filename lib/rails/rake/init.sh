#!/usr/bin/env bash
# ============================================================
# RAKE — Carregador dos submódulos Rake
# ============================================================

_rake_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rake: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_rake_source "$DEV_DASHBOARD_DIR/lib/rails/rake/helpers.sh"
_rake_source "$DEV_DASHBOARD_DIR/lib/rails/rake/run.sh"
_rake_source "$DEV_DASHBOARD_DIR/lib/rails/rake/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-rake 2>/dev/null || true
fi