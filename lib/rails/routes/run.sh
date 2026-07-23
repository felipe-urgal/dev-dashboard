#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-routes — Visualizar rotas do projeto
# ============================================================
dev-rails-menu-routes() {
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
    _dev_breadcrumb "Comandos Rails" "Rotas"
    echo >&2
    _dev_step "Visualize as rotas do projeto."
    echo >&2

    local action
    action=$(_routes_menu_show)
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Todas")
        _routes_show
        ;;
      "Buscar")
        local term=""
        if _dev_has gum; then
          term=$(gum input --placeholder "Termo de busca (ex: users)...")
        else
          read -r -p "Termo de busca (ex: users): " term
        fi
        [ -z "$term" ] && continue
        _routes_show -g "$term"
        ;;
      "Controller")
        local controller=""
        if _dev_has gum; then
          controller=$(gum input --placeholder "Nome do controller (ex: users)...")
        else
          read -r -p "Nome do controller (ex: users): " controller
        fi
        [ -z "$controller" ] && continue
        _routes_show -c "$controller"
        ;;
    esac
  done
}
