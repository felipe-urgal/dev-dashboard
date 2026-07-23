#!/usr/bin/env bash
# ============================================================
# dev-node-menu — Menu principal de comandos Node
# ============================================================
dev-node-menu() {
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
    _dev_breadcrumb "Comandos Node"
    echo >&2
    _dev_step "Selecione uma área para gerenciar o projeto Node."
    echo >&2
    local action
    action=$(_node_menu_show)
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0
    case "$action" in
      "Servidor")     dev-node-menu-servidor "$project" ;;
      "Testes")       dev-node-menu-testes "$project" ;;
      "Dependências") dev-node-menu-deps "$project" ;;
      "Scripts")      dev-node-menu-scripts "$project" ;;
      "Ferramentas")  dev-node-menu-tools "$project" ;;
    esac
  done
}