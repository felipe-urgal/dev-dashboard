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

# Comando do primeiro processo dono da porta, ou vazio se a porta estiver livre.
_dev_port_owner_cmd() {
  local pid
  pid=$(lsof -t -i :"$1" 2>/dev/null | head -n1)
  [ -z "$pid" ] && return 1
  ps -p "$pid" -o command= 2>/dev/null | head -n1
}

# Detecta se o dono da porta é um processo Docker (docker-proxy, containerd-shim,
# com.docker.backend etc.) em vez do servidor local gerenciado por este dashboard.
_dev_port_owned_by_docker() {
  local cmd="$1"
  [[ "$cmd" == *docker* || "$cmd" == *containerd-shim* || "$cmd" == *com.docker* ]]
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
  local -a projects
  readarray -t projects < <(project-list)
  local project
  for project in "${projects[@]}"; do
    local port
    port=$(project-port "$project") || continue
    if [ -n "$port" ] && _is_port_in_use "$port"; then
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