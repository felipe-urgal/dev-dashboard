#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-banco — Menu principal de banco de dados
# ============================================================
dev-rails-menu-banco() {
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
    _dev_breadcrumb "Comandos Rails" "Banco"
    echo >&2
    _dev_step "Gerencie o banco de dados: serviço, criação, migrações e mais."
    echo >&2

    local -a options=(
      "Gerenciar serviço do banco"
      "db:prepare"
      "db:create"
      "db:migrate"
      "db:rollback"
      "db:seed"
      "db:reset"
      "migrate:status"
      "db:snapshot"
      "db:restore"
    )
    local -a descriptions=(
      "Iniciar/Parar serviço MySQL/PostgreSQL"
      "Preparar banco (criar, migrar, seed)"
      "Criar banco de dados"
      "Executar migrações pendentes"
      "Reverter N migrações (steps)"
      "Popular banco com dados iniciais (seeds)"
      "Resetar banco (drop, create, migrate, seed)"
      "Verificar status das migrações"
      "Backup rápido do banco atual (antes de trocar de branch)"
      "Restaurar um snapshot criado anteriormente"
    )
    options+=("Voltar")
    descriptions+=("Voltar ao menu Rails")

    local action=""
    if _dev_has gum; then
      local rows="Ação;Descrição\n"
      local i
      for i in "${!options[@]}"; do
        rows+="${options[$i]};${descriptions[$i]}\n"
      done
      local selected
      selected=$(printf "%b" "$rows" | gum table \
        --separator=";" \
        --border="rounded" \
        --border.foreground="#7C3AED" \
        --header.foreground="#7C3AED")
      [ -n "$selected" ] && action=$(echo "$selected" | cut -d';' -f1 | xargs)
    else
      echo "Banco de Dados:" >&2
      local j
      for j in "${!options[@]}"; do
        echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
      done
      read -r -p "Escolha uma opção: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]]; then
        local idx=$((choice - 1))
        if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#options[@]} ]; then
          action="${options[$idx]}"
        fi
      fi
    fi

    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    local rails_cmd=""
    if [ -f "bin/rails" ]; then
      rails_cmd="bin/rails"
    else
      rails_cmd="bundle exec rails"
    fi

    case "$action" in
      "Gerenciar serviço do banco") _dev_manage_database_service "$project" "$path" ;;
      "db:prepare")                 _dev_db_prepare "$rails_cmd" ;;
      "db:create")                  _dev_db_create "$rails_cmd" ;;
      "db:migrate")                 _dev_db_migrate "$rails_cmd" ;;
      "db:rollback")                _dev_db_rollback "$rails_cmd" "$project" ;;
      "db:seed")                    _dev_db_seed "$rails_cmd" ;;
      "db:reset")                   _dev_db_reset "$rails_cmd" ;;
      "migrate:status")             _dev_db_status "$rails_cmd" ;;
      "db:snapshot")                _dev_db_snapshot "$rails_cmd" "$project" ;;
      "db:restore")                 _dev_db_restore "$rails_cmd" "$project" ;;
    esac
    _dev_pause
  done
}