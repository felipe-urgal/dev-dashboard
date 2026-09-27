#!/usr/bin/env bash
# ============================================================
# RAILS — Cliente Terminal dos contratos atuais
# ============================================================

_rails_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Rails: submódulo não encontrado — $file" >&2
    return 1
  fi
}

declare -f _runtime_api >/dev/null 2>&1 || _rails_source "$DEV_DASHBOARD_DIR/lib/runtime/api.sh"
_rails_source "$DEV_DASHBOARD_DIR/lib/rails/menu/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-rails-menu 2>/dev/null || true
fi
