#!/usr/bin/env bash
# ============================================================
# DATABASE — Carregador dos submódulos de banco de dados
# ============================================================

_db_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Database: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/helpers.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/prepare.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/create.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/migrate.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/rollback.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/seed.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/reset.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/status.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/snapshot.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/restore.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/service.sh"
_db_source "$DEV_DASHBOARD_DIR/lib/rails/database/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-banco 2>/dev/null || true
fi