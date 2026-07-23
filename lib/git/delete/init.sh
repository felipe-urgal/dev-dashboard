#!/usr/bin/env bash
# ============================================================
# DELETE — Carregador do submódulo Delete Branch
# ============================================================

_git_delete_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "⚠️  Git Delete: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_delete_source "$DEV_DASHBOARD_DIR/lib/git/delete/helpers.sh"
_git_delete_source "$DEV_DASHBOARD_DIR/lib/git/delete/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-delete 2>/dev/null || true
fi