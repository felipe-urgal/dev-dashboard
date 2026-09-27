#!/usr/bin/env bash
# ============================================================
# dev-node-menu — Runtime Node alinhado à API/Web
# ============================================================
dev-node-menu() {
  local project="$1"

  if ! _dev_dashboard_api_available; then
    _dev_err "A API local do Dev Dashboard é necessária para as ações Node."
    _dev_pause
    return 1
  fi

  while true; do
    local action
    action=$(_runtime_choose "Node" "Servidor" "Testes" "Dependências / Build" "Voltar") || return 0

    case "$action" in
      "Servidor") _runtime_server_menu "$project" ;;
      "Testes") _runtime_tests_menu "$project" ;;
      "Dependências / Build") _runtime_dependencies_menu "$project" ;;
      "Voltar") return 0 ;;
    esac
  done
}
