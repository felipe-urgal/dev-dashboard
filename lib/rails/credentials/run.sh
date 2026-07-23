#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-credentials — Editar credentials do projeto
# ============================================================
dev-rails-menu-credentials() {
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
    _dev_breadcrumb "Comandos Rails" "Credenciais"
    echo >&2
    _dev_step "Edite as credentials criptografadas do projeto."
    echo >&2

    local action
    action=$(_credentials_menu_show)
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Padrão")      _credentials_edit "" ;;
      "Development") _credentials_edit "development" ;;
      "Production")  _credentials_edit "production" ;;
    esac
  done
}
