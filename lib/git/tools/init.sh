#!/usr/bin/env bash
# ============================================================
# TOOLS — Carregador do submódulo Tools (loop principal)
# ============================================================

_git_tools_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Tools: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_tools_source "$DEV_DASHBOARD_DIR/lib/git/tools/helpers.sh"
_git_tools_source "$DEV_DASHBOARD_DIR/lib/git/tools/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-tools 2>/dev/null || true
fi