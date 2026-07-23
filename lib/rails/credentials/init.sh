#!/usr/bin/env bash
# ============================================================
# RAILS CREDENTIALS — Carregador do submódulo Credenciais
# ============================================================
_rails_credentials_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails Credentials: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_rails_credentials_source "$DEV_DASHBOARD_DIR/lib/rails/credentials/helpers.sh"
_rails_credentials_source "$DEV_DASHBOARD_DIR/lib/rails/credentials/run.sh"
