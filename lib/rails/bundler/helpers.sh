#!/usr/bin/env bash
# ============================================================
# BUNDLER HELPERS — Menu de gems
# ============================================================
_bundler_menu_show() {
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Instalar;Instalar gems do Gemfile (bundle install)\n"
    rows+="Atualizar;Atualizar gems (bundle update)\n"
    rows+="Outdated;Listar gems desatualizadas (bundle outdated)\n"
    rows+="Voltar;Voltar ao menu Rails\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Instalar" "Atualizar" "Outdated" "Voltar")
    echo "Bundler:" >&2
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
