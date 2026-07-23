#!/usr/bin/env bash
# ============================================================
# PUBLISH — Carregador do submódulo Publish
# ============================================================

_git_publish_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git Publish: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_git_publish_source "$DEV_DASHBOARD_DIR/lib/git/publish/helpers.sh"
_git_publish_source "$DEV_DASHBOARD_DIR/lib/git/publish/run.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f git-publish 2>/dev/null || true
fi