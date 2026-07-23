#!/usr/bin/env bash
# ============================================================
# SERVER — Carregador dos submódulos do servidor Rails
# ============================================================
_rails_server_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails Server: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_rails_server_source "$DEV_DASHBOARD_DIR/lib/rails/server/helpers.sh"
_rails_server_source "$DEV_DASHBOARD_DIR/lib/rails/server/start.sh"
_rails_server_source "$DEV_DASHBOARD_DIR/lib/rails/server/stop.sh"
_rails_server_source "$DEV_DASHBOARD_DIR/lib/rails/server/logs.sh"
_rails_server_source "$DEV_DASHBOARD_DIR/lib/rails/server/menu.sh"
if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu-servidor 2>/dev/null || true
fi