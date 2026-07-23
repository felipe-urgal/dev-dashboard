#!/usr/bin/env bash
# ============================================================
# dev-node-menu-servidor — Submenu Servidor Node
# ============================================================
dev-node-menu-servidor() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Node" "Servidor"
    echo >&2
    _dev_step "Gerencie o servidor Node: iniciar, parar ou ver logs."
    echo >&2

    local port
    port=$(project-port "$project")
    local is_running=false
    local pid=""
    if _node_server_running "$port"; then
      is_running=true
      pid=$(_node_server_pid "$port")
    fi

    local action
    action=$(_node_server_menu_show "$is_running" "$port" "$pid")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Iniciar servidor")   _node_server_start "$project" ;;
      "Parar servidor")     _node_server_stop "$project" ;;
      "Reiniciar servidor") dev-stop "$project" ; sleep 1 ; _node_server_start "$project" ;;
      "Ver logs")           _node_server_logs "$project" ;;
    esac
  done
}