#!/usr/bin/env bash
# ============================================================
# UNDO — Carregador do submódulo Undo
# ============================================================

_git_undo_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Undo: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_undo_source "$DEV_DASHBOARD_DIR/lib/git/undo/helpers.sh"
_git_undo_source "$DEV_DASHBOARD_DIR/lib/git/undo/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-undo 2>/dev/null || true
fi