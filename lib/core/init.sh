#!/usr/bin/env bash
# ============================================================
# CORE — Carregador dos utilitários básicos
# ============================================================
_core_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Core: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_core_source "$DEV_DASHBOARD_DIR/lib/core/checks.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/logging.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/interaction.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/navigation.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/breadcrumb.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/services.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/spinner.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/runners.sh"
_core_source "$DEV_DASHBOARD_DIR/lib/core/secrets.sh"