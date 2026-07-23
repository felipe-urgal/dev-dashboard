#!/usr/bin/env bash
# ============================================================
# SWITCH — Carregador do submódulo Switch
# ============================================================

_git_switch_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "⚠️  Git Switch: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_switch_source "$DEV_DASHBOARD_DIR/lib/git/switch/helpers.sh"
_git_switch_source "$DEV_DASHBOARD_DIR/lib/git/switch/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-switch 2>/dev/null || true
fi