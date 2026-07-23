#!/usr/bin/env bash
# ============================================================
# NODE MENU HELPERS — Exibição do menu
# ============================================================
_node_menu_show() {
  local -a options=("Servidor" "Testes" "Dependências" "Scripts" "Ferramentas")
  local -a descriptions=(
    "Gerenciar servidor Node (iniciar, parar, logs)"
    "Executar testes e cobertura"
    "Instalar e atualizar dependências"
    "Executar scripts do package.json"
    "Lint, build e typecheck"
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
    echo "Comandos Node:" >&2
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