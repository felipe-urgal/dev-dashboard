#!/usr/bin/env bash
# ============================================================
# MENU HELPERS — Exibição da tabela de opções
# ============================================================
_rails_menu_show() {
  local project="$1"
  local has_webpack="$2"

  local -a options=("Servidor")
  local -a descriptions=("Gerenciar servidor Rails (iniciar, parar, logs)")

  if [ "$has_webpack" = "yes" ]; then
    options+=("Webpack")
    descriptions+=("Gerenciar webpack-dev-server (iniciar, parar, logs)")
  fi

  options+=(
    "Console"
    "Testes"
    "Banco"
    "Bundler"
    "Rotas"
    "Generators"
    "Sidekiq"
    "Assets"
    "Rake Tasks"
    "Credenciais"
  )
  descriptions+=(
    "Abrir console Rails (development, test, production)"
    "Executar testes (rspec com opções)"
    "Comandos de banco de dados (migrate, create, etc.)"
    "Gerenciar gems (install, update, outdated)"
    "Visualizar rotas do projeto (todas, busca, controller)"
    "Gerar código (model, migration, controller, etc.)"
    "Gerenciar Sidekiq (iniciar, parar, logs, status)"
    "Compilar assets (yarn/esbuild) e precompilar"
    "Listar e executar tarefas Rake"
    "Editar credentials criptografadas"
  )

  options+=("Voltar")
  descriptions+=("Voltar ao menu do projeto")

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
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    echo "Comandos Rails:" >&2
    local j
    for j in "${!options[@]}"; do
      echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
    done
    read -r -p "Escolha uma opção: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]]; then
      local idx=$((choice - 1))
      if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#options[@]} ]; then
        echo "${options[$idx]}"
      fi
    fi
  fi
}