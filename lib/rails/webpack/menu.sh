#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-webpack — Submenu Webpack
# ============================================================
dev-rails-menu-webpack() {
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
    _dev_breadcrumb "Comandos Rails" "Webpack"
    echo >&2
    _dev_step "Gerencie o webpack-dev-server: iniciar, parar ou ver logs."
    echo >&2
    local is_running=false
    local pid=""
    if _webpack_running "$project"; then
      is_running=true
      pid="$_WEBPACK_PID"
    fi
    local action
    action=$(_webpack_menu_show "$is_running" "$pid")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0
    case "$action" in
      "Iniciar webpack (background)") _webpack_start "$project" ;;
      "Parar webpack")                _webpack_stop "$project" ;;
      "Ver logs webpack")             _webpack_logs "$project" ;;
    esac
  done
}