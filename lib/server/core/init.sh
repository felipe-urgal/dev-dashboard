#!/usr/bin/env bash
# ============================================================
# SERVER CORE — Carregador do core do servidor
# ============================================================
_server_core_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Server Core: submódulo não encontrado — $file" >&2
    return 1
  fi
}
_server_core_source "$DEV_DASHBOARD_DIR/lib/server/core/helpers.sh"
_server_core_source "$DEV_DASHBOARD_DIR/lib/server/core/start.sh"
_server_core_source "$DEV_DASHBOARD_DIR/lib/server/core/wait_port.sh"
_server_core_source "$DEV_DASHBOARD_DIR/lib/server/core/commands.sh"
if [[ -n "$BASH_VERSION" ]]; then
  export -f dev-start-all _dev_start_server _wait_for_port \
         dev-clean dev-stop dev-stop-all dev-kill-port dev-restart \
         _dev_project_id _is_port_in_use _kill_port \
         _dev_port_owner_cmd _dev_port_owned_by_docker \
         _dev_live_pid_from_file \
         _dev_has_any_server _dev_is_webpack_running 2>/dev/null || true
fi
