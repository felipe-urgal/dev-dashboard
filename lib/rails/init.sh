#!/usr/bin/env bash
# ============================================================
# RAILS — Carregador dos submódulos Rails
# ============================================================
# Carrega de forma segura os submódulos do Rails.
# Se algum arquivo estiver ausente, apenas exibe um aviso,
# mas não impede o funcionamento do restante do dashboard.
# ============================================================

# ------------------------------------------------------------
# Função auxiliar local (evita dependência de core.sh)
# ------------------------------------------------------------
_rails_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails: submódulo não encontrado — $file" >&2
    return 1
  fi
}

# ------------------------------------------------------------
# Carregamento dos submódulos
# ------------------------------------------------------------
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/database/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/assets/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/console/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/generators/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/menu/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/server/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/sidekiq/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/webpack/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/tests/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/rake/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/bundler/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/routes/init.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/credentials/init.sh"

# ------------------------------------------------------------
# Exportação das funções principais (apenas no Bash)
# ------------------------------------------------------------
if [[ -n "$BASH_VERSION" ]]; then
  # Exporta apenas o ponto de entrada do menu Rails
  # As demais funções (_dev_run_*) já são exportadas pelo init.sh principal
  export -f dev-rails-menu 2>/dev/null || true
fi