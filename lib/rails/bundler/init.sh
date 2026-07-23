#!/usr/bin/env bash
# ============================================================
# RAILS BUNDLER — Carregador do submódulo Bundler
# ============================================================
_rails_bundler_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails Bundler: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_rails_bundler_source "$DEV_DASHBOARD_DIR/lib/rails/bundler/helpers.sh"
_rails_bundler_source "$DEV_DASHBOARD_DIR/lib/rails/bundler/run.sh"
