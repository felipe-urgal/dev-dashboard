#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-generators — Menu principal de Geradores Rails
# ============================================================
dev-rails-menu-generators() {
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
    _dev_breadcrumb "Comandos Rails" "Generators"
    echo >&2
    _dev_step "Gere código Rails: models, migrations, controllers e mais."
    echo >&2

    local -a options=("Model" "Migration" "Controller" "Scaffold" "Job" "Mailer" "Destroy")
    local -a descriptions=(
      "Gerar model com atributos"
      "Gerar migration"
      "Gerar controller com ações"
      "Gerar scaffold completo"
      "Gerar job"
      "Gerar mailer"
      "Destruir código gerado (cuidado!)"
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
      echo "Geradores Rails:" >&2
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
      "Model")      _generators_model "$rails_cmd" "$project" ;;
      "Migration")  _generators_migration "$rails_cmd" "$project" ;;
      "Controller") _generators_controller "$rails_cmd" ;;
      "Scaffold")   _generators_scaffold "$rails_cmd" "$project" ;;
      "Job")        _generators_job "$rails_cmd" ;;
      "Mailer")     _generators_mailer "$rails_cmd" ;;
      "Destroy")    _generators_destroy "$rails_cmd" ;;
    esac
    sleep 3
  done
}