#!/usr/bin/env bash
# ============================================================
# GIT — Cliente Terminal dos contratos Git da API
# ============================================================

_git_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_source "$DEV_DASHBOARD_DIR/lib/git/helpers.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/api.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/menu/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/tools/init.sh"
