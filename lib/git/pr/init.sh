#!/usr/bin/env bash
# ============================================================
# PR — Carregador do submódulo Pull Request
# ============================================================

_git_pr_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git PR: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_pr_source "$DEV_DASHBOARD_DIR/lib/git/pr/helpers.sh"
_git_pr_source "$DEV_DASHBOARD_DIR/lib/git/pr/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-pr 2>/dev/null || true
fi
