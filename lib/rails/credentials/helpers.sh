#!/usr/bin/env bash
# ============================================================
# CREDENTIALS HELPERS — Menu de ambientes
# ============================================================
_credentials_menu_show() {
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Padrão;Editar credentials padrão (config/credentials.yml.enc)\n"
    rows+="Development;Editar credentials do ambiente development\n"
    rows+="Production;Editar credentials do ambiente production\n"
    rows+="Voltar;Voltar ao menu Rails\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Padrão" "Development" "Production" "Voltar")
    echo "Credenciais:" >&2
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

_credentials_edit() {
  local env="$1"
  local editor="${EDITOR:-}"
  if [ -z "$editor" ]; then
    _dev_has nano && editor="nano" || editor="vim"
  fi

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "Editor: $editor (defina \$EDITOR para trocar)" >&2
  else
    echo "Editor: $editor (defina \$EDITOR para trocar)" >&2
  fi
  echo >&2

  if [ -n "$env" ]; then
    EDITOR="$editor" _dev_run_rails credentials:edit --environment "$env"
  else
    EDITOR="$editor" _dev_run_rails credentials:edit
  fi
  local ret=$?
  if [ $ret -eq 0 ]; then
    _dev_ok "Credenciais salvas."
  else
    _dev_err "Falha ao editar credenciais (código $ret)."
  fi
  _dev_pause
}
