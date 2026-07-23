#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-sidekiq — Submenu Sidekiq
# ============================================================
dev-rails-menu-sidekiq() {
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
    _dev_breadcrumb "Comandos Rails" "Sidekiq"
    echo >&2
    _dev_step "Gerencie o Sidekiq: iniciar, parar, ver status ou logs."
    echo >&2

    local is_running=false
    local pid=""
    if _sidekiq_running "$project"; then
      is_running=true
      pid="$_SIDEKIQ_PID"
    fi

    local action
    action=$(_sidekiq_menu_show "$is_running" "$pid")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Iniciar Sidekiq") _sidekiq_start "$project" ;;
      "Parar Sidekiq")   _sidekiq_stop "$project" ;;
      "Ver logs")        _sidekiq_logs "$project" ;;
      "Status")          _sidekiq_status "$project" ;;
      "Reiniciar")       _sidekiq_restart "$project" ;;
    esac
  done
}