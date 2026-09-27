#!/usr/bin/env bash
# ============================================================
# ACTIONS — Carregador das ações concretas
# ============================================================
_actions_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Actions: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_actions_source "$DEV_DASHBOARD_DIR/lib/actions/terminal.sh"
_actions_source "$DEV_DASHBOARD_DIR/lib/actions/browser.sh"
_actions_source "$DEV_DASHBOARD_DIR/lib/actions/editor.sh"
if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-terminal dev-open dev-editor dev-sublime 2>/dev/null || true
fi