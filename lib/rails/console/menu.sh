#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-console — Submenu Console Rails
# ============================================================
dev-rails-menu-console() {
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
    _dev_breadcrumb "Comandos Rails" "Console"
    echo >&2
    _dev_step "Escolha o ambiente para abrir o console Rails."
    echo >&2

    local -a options=("Development" "Test" "Production")
    local -a descriptions=(
      "Abrir console no ambiente development"
      "Abrir console no ambiente test"
      "Abrir console no ambiente production (cuidado!)"
    )
    options+=("Voltar")
    descriptions+=("Voltar ao menu Rails")

    local env=""
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
      [ -n "$selected" ] && env=$(echo "$selected" | cut -d';' -f1 | xargs)
    else
      echo "Console Rails:" >&2
      local j
      for j in "${!options[@]}"; do
        echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
      done
      read -r -p "Escolha uma opção: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]]; then
        local idx=$((choice - 1))
        if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#options[@]} ]; then
          env="${options[$idx]}"
        fi
      fi
    fi

    [ -z "$env" ] || [ "$env" = "Voltar" ] && return 0

    case "$env" in
      "Development") _console_development ;;
      "Test")        _console_test ;;
      "Production")  _console_production ;;
    esac
  done
}