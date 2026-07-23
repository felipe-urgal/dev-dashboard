#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-rake — Submenu Tarefas Rake
# ============================================================
dev-rails-menu-rake() {
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
    _dev_breadcrumb "Comandos Rails" "Rake Tasks"
    echo >&2
    _dev_step "Liste e execute tarefas Rake do projeto."
    echo >&2
    local action
    action=$(_rake_menu_show)
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0
    case "$action" in
      "Listar e executar tarefa")           _rake_run_interactive ;;
      "Digitar nome da tarefa manualmente")  _rake_run_manual ;;
    esac
  done
}