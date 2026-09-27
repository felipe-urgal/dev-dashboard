#!/usr/bin/env bash
# ============================================================
# dev-rails-menu — Runtime Rails alinhado à API/Web
# ============================================================
dev-rails-menu() {
  local project="$1"

  if ! _dev_dashboard_api_available; then
    _dev_err "A API local do Dev Dashboard é necessária para as ações Rails."
    _dev_pause
    return 1
  fi

  while true; do
    local -a options=("Servidor")

    if _runtime_terminal_supported "$project" "rails-console"; then
      options+=("Console Rails")
    fi

    options+=("Testes" "Dependências / Build" "Migrations")

    if _runtime_worker_detected "$project" "sidekiq"; then
      options+=("Sidekiq")
    fi
    if _runtime_worker_detected "$project" "webpack"; then
      options+=("Webpack")
    fi

    options+=("Voltar")

    local action
    action=$(_runtime_choose "Rails" "${options[@]}") || return 0

    case "$action" in
      "Servidor") _runtime_server_menu "$project" ;;
      "Console Rails")
        _runtime_api terminal-open "$project" "rails-console"
        _dev_pause
        ;;
      "Testes") _runtime_tests_menu "$project" ;;
      "Dependências / Build") _runtime_dependencies_menu "$project" ;;
      "Migrations") _runtime_migrations_menu "$project" ;;
      "Sidekiq") _runtime_worker_menu "$project" "sidekiq" "Sidekiq" ;;
      "Webpack") _runtime_worker_menu "$project" "webpack" "Webpack" ;;
      "Voltar") return 0 ;;
    esac
  done
}
