#!/usr/bin/env bash
# ============================================================
# STASH — Carregador do submódulo Stash
# ============================================================

_git_stash_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Stash: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_stash_source "$DEV_DASHBOARD_DIR/lib/git/stash/helpers.sh"
_git_stash_source "$DEV_DASHBOARD_DIR/lib/git/stash/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-stash 2>/dev/null || true
fi
