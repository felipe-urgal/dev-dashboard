#!/usr/bin/env bash
# ============================================================
# SAVE — Carregador do submódulo Save
# ============================================================

_git_save_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Save: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_save_source "$DEV_DASHBOARD_DIR/lib/git/save/helpers.sh"
_git_save_source "$DEV_DASHBOARD_DIR/lib/git/save/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-save 2>/dev/null || true
fi