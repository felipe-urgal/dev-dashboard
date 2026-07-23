#!/usr/bin/env bash
# ============================================================
# COMMIT — Carregador do submódulo Commit
# ============================================================

_git_commit_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Commit: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_commit_source "$DEV_DASHBOARD_DIR/lib/git/commit/helpers.sh"
_git_commit_source "$DEV_DASHBOARD_DIR/lib/git/commit/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-commit 2>/dev/null || true
fi