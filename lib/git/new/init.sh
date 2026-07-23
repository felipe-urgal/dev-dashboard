#!/usr/bin/env bash
# ============================================================
# NEW — Carregador do submódulo Nova Branch
# ============================================================

_git_new_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git New: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_new_source "$DEV_DASHBOARD_DIR/lib/git/new/helpers.sh"
_git_new_source "$DEV_DASHBOARD_DIR/lib/git/new/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-new 2>/dev/null || true
fi