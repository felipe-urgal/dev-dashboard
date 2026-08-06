#!/usr/bin/env bash
# ============================================================
# BACKUP — Carregador do submódulo de backup/restore do estado local
# ============================================================

_backup_module_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Backup: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_backup_module_source "$DEV_DASHBOARD_DIR/lib/backup/helpers.sh"
_backup_module_source "$DEV_DASHBOARD_DIR/lib/backup/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-backup dev-restore 2>/dev/null || true
fi
