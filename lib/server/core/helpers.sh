#!/usr/bin/env bash
# ============================================================
# SERVER CORE HELPERS — Utilitários de servidor
# ============================================================

_dev_project_id() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g'
}

_is_port_in_use() {
  lsof -i :"$1" >/dev/null 2>&1
}

_kill_port() {
  local port="$1"
  if _is_port_in_use "$port"; then
    local pid
    pid=$(lsof -t -i :"$port" 2>/dev/null)
    if [ -n "$pid" ]; then
      _dev_ok "Matando processo na porta $port (PID $pid)..."
      kill -9 "$pid" 2>/dev/null && _dev_ok "Processo $pid morto." || _dev_err "Falha ao matar $pid."
    fi
  else
    _dev_ok "Porta $port já está livre."
  fi
}

_dev_has_any_server() {
  if _dev_dashboard_api_available; then
    local snapshot
    snapshot=$(_dev_dashboard_snapshot 2>/dev/null) || return 1
    local project_id project_name project_path project_type enabled port runtime_status environment_instance_id pid
    while IFS=$'\t' read -r project_id project_name project_path project_type enabled port runtime_status environment_instance_id pid; do
      case "$runtime_status" in
        running|starting|stopping) return 0 ;;
      esac
    done <<< "$snapshot"
    return 1
  fi

  # Fallback standalone: somente PID files criados pelo próprio dev-tools.
  local pid_file
  for pid_file in "$DEV_RUN_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

_dev_is_webpack_running() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/webpack-${id}.pid"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}