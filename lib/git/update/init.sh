#!/usr/bin/env bash
# ============================================================
# UPDATE — Carregador do submódulo Update
# ============================================================

_git_update_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "⚠️  Git Update: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_update_source "$DEV_DASHBOARD_DIR/lib/git/update/helpers.sh"
_git_update_source "$DEV_DASHBOARD_DIR/lib/git/update/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-update 2>/dev/null || true
fi