#!/usr/bin/env bash
# ============================================================
# SIDEKIQ — Carregador dos submódulos Sidekiq
# ============================================================

_sidekiq_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Sidekiq: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/helpers.sh"
_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/start.sh"
_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/stop.sh"
_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/logs.sh"
_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/status.sh"
_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/restart.sh"
_sidekiq_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/menu.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-sidekiq 2>/dev/null || true
fi