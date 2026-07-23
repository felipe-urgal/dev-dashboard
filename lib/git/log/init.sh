#!/usr/bin/env bash
# ============================================================
# LOG — Carregador do submódulo Log
# ============================================================

_git_log_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "⚠️  Git Log: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_log_source "$DEV_DASHBOARD_DIR/lib/git/log/helpers.sh"
_git_log_source "$DEV_DASHBOARD_DIR/lib/git/log/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-log 2>/dev/null || true
fi