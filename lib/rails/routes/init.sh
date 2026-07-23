#!/usr/bin/env bash
# ============================================================
# RAILS ROUTES — Carregador do submódulo Rotas
# ============================================================
_rails_routes_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails Routes: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_rails_routes_source "$DEV_DASHBOARD_DIR/lib/rails/routes/helpers.sh"
_rails_routes_source "$DEV_DASHBOARD_DIR/lib/rails/routes/run.sh"
