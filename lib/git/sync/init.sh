#!/usr/bin/env bash
# ============================================================
# SYNC — Carregador do submódulo Sync
# ============================================================

_git_sync_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Sync: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_sync_source "$DEV_DASHBOARD_DIR/lib/git/sync/helpers.sh"
_git_sync_source "$DEV_DASHBOARD_DIR/lib/git/sync/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-sync 2>/dev/null || true
fi
