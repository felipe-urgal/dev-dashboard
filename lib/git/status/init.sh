#!/usr/bin/env bash
# ============================================================
# STATUS — Carregador do submódulo Status/Diff
# ============================================================

_git_status_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "⚠️  Git Status: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_status_source "$DEV_DASHBOARD_DIR/lib/git/status/helpers.sh"
_git_status_source "$DEV_DASHBOARD_DIR/lib/git/status/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-status-diff 2>/dev/null || true
fi