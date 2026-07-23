#!/usr/bin/env bash
# ============================================================
# NODE DEPS HELPERS — Menu de dependências
# ============================================================
_node_deps_menu_show() {
  local pkg="$1"

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Instalar;Instalar dependências ($pkg install)\n"
    rows+="Atualizar;Atualizar dependências ($pkg upgrade/update)\n"
    rows+="Reinstalar;Remover node_modules e instalar do zero\n"
    rows+="Voltar;Voltar ao menu Node\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Instalar" "Atualizar" "Reinstalar" "Voltar")
    echo "Dependências ($pkg):" >&2
    local i=1
    local opt
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha uma opção: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
      echo "${options[$((choice-1))]}"
    fi
  fi
}

_node_deps_update_cmd() {
  local pkg="$1"
  case "$pkg" in
    pnpm) echo "pnpm update" ;;
    yarn) echo "yarn upgrade" ;;
    npm)  echo "npm update" ;;
  esac
}
