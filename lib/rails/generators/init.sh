#!/usr/bin/env bash
# ============================================================
# GENERATORS — Carregador dos submódulos de geradores Rails
# ============================================================

_generators_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Generators: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/helpers.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/model.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/migration.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/controller.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/scaffold.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/job.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/mailer.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/destroy.sh"
_generators_source "$DEV_DASHBOARD_DIR/lib/rails/generators/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-generators 2>/dev/null || true
fi