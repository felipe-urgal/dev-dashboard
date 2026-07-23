#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-testes — Submenu Testes Rails
# ============================================================
dev-rails-menu-testes() {
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
    _dev_breadcrumb "Comandos Rails" "Testes"
    echo >&2
    _dev_step "Execute os testes: todos, selecionados ou um arquivo específico."
    echo >&2

    local -a options=("Todos" "Falhos" "Selecionar" "Arquivo")
    local -a descriptions=(
      "Executar todos os testes (rspec progress)"
      "Reexecutar apenas os testes que falharam (--only-failures)"
      "Escolher arquivos spec específicos"
      "Executar um arquivo spec específico (com repetição)"
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
      echo "Testes Rails:" >&2
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

    case "$action" in
      "Todos")      _tests_run_all ;;
      "Falhos")     _tests_run_failures ;;
      "Selecionar") _tests_run_selected ;;
      "Arquivo")    _tests_run_single "$project" "$path" ;;
    esac
  done
}