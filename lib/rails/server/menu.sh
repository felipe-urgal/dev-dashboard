#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-servidor — Submenu Servidor Rails
# ============================================================
dev-rails-menu-servidor() {
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
    _dev_breadcrumb "Comandos Rails" "Servidor"
    echo >&2
    _dev_step "Gerencie o servidor Rails: iniciar, parar ou ver logs."
    echo >&2
    local is_running=false
    local pid=""
    _SERVER_PID=""
    if _server_running "$project"; then
      is_running=true
      pid="$_SERVER_PID"
    fi
    local port
    port=$(project-port "$project")
    local action
    action=$(_server_menu_show "$is_running" "$port" "$pid")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0
    case "$action" in
      "Iniciar servidor")   _server_start "$project" ;;
      "Parar servidor")     _server_stop "$project" ;;
      "Reiniciar servidor") dev-restart "$project" ; _dev_pause ;;
      "Ver logs")           _server_logs "$project" ;;
    esac
  done
}