#!/usr/bin/env bash
# ============================================================
# dev-rails-menu — Menu principal de comandos Rails
# ============================================================
dev-rails-menu() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1
  local has_webpack
  has_webpack=$(project-has-webpack "$project")
  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Rails"
    echo >&2
    _dev_step "Selecione uma área para gerenciar o projeto Rails."
    echo >&2
    local action
    action=$(_rails_menu_show "$project" "$has_webpack")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0
    case "$action" in
      "Servidor")    dev-rails-menu-servidor "$project" ;;
      "Webpack")     dev-rails-menu-webpack "$project" ;;
      "Console")     dev-rails-menu-console "$project" ;;
      "Testes")      dev-rails-menu-testes "$project" ;;
      "Banco")       dev-rails-menu-banco "$project" ;;
      "Bundler")     dev-rails-menu-bundler "$project" ;;
      "Rotas")       dev-rails-menu-routes "$project" ;;
      "Generators")  dev-rails-menu-generators "$project" ;;
      "Sidekiq")     dev-rails-menu-sidekiq "$project" ;;
      "Assets")      dev-rails-menu-assets "$project" ;;
      "Rake Tasks")  dev-rails-menu-rake "$project" ;;
      "Credenciais") dev-rails-menu-credentials "$project" ;;
    esac
  done
}