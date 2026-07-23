#!/usr/bin/env bash
# ============================================================
# DOCTOR — Carregador do módulo Doctor
# ============================================================

_doctor_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Doctor: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_doctor_source "$DEV_DASHBOARD_DIR/lib/doctor/check.sh"
_doctor_source "$DEV_DASHBOARD_DIR/lib/doctor/help.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-doctor dev-help 2>/dev/null || true
fi