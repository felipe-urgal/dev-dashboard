#!/usr/bin/env bash
# ============================================================
# STASH HELPERS — Listagem, seleção e menu de stashes
# ============================================================

_stash_list() {
  git stash list --format="%gd: %s"
}

_stash_menu_show() {
  local stash_count="$1"

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Salvar;Guardar alterações atuais em um novo stash\n"
    if [ "$stash_count" -gt 0 ]; then
      rows+="Aplicar;Aplicar um stash salvo (com opção de manter ou remover)\n"
      rows+="Descartar;Remover um stash salvo definitivamente\n"
    fi
    rows+="Voltar;Voltar ao menu Git\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Salvar")
    if [ "$stash_count" -gt 0 ]; then
      options+=("Aplicar" "Descartar")
    fi
    options+=("Voltar")
    echo "Stash:" >&2
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

# Seleciona um stash da lista; retorna a referência (ex: stash@{0}) via stdout.
_stash_select_entry() {
  local -a entries
  readarray -t entries < <(_stash_list)
  [ ${#entries[@]} -eq 0 ] && return 1

  local chosen=""
  if _dev_has gum; then
    chosen=$(printf '%s\n' "${entries[@]}" | gum choose --header "Escolha o stash:")
  else
    echo "Stashes salvos:" >&2
    local i=1
    local entry
    for entry in "${entries[@]}"; do
      echo "  $i) $entry" >&2
      ((i++))
    done
    read -r -p "Escolha o número (Enter para cancelar): " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#entries[@]} ]; then
      chosen="${entries[$((num-1))]}"
    fi
  fi

  [ -z "$chosen" ] && return 1
  echo "${chosen%%:*}"
}

_stash_save() {
  if ! _git_check_dirty; then
    _dev_warn "Não há alterações para guardar."
    sleep 2
    return 0
  fi

  local message=""
  if _dev_has gum; then
    message=$(gum input --placeholder "Mensagem do stash (opcional)...")
  else
    read -r -p "Mensagem do stash (opcional): " message
  fi
  [ -z "$message" ] && message="dev-dashboard stash"

  if git stash push --include-untracked -m "$message"; then
    _dev_ok "Alterações guardadas: $message"
  else
    _dev_err "Falha ao criar stash."
  fi
  sleep 2
}

_stash_apply() {
  local ref
  ref=$(_stash_select_entry) || { _dev_warn "Nenhum stash selecionado."; sleep 1; return 0; }

  local keep=""
  if _dev_has gum; then
    gum confirm "Manter o stash após aplicar? (Não = pop)" --default=false --affirmative="Manter" --negative="Remover" && keep="yes"
  else
    read -r -p "Manter o stash após aplicar? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && keep="yes"
  fi

  local ret
  if [ "$keep" = "yes" ]; then
    git stash apply "$ref"
    ret=$?
  else
    git stash pop "$ref"
    ret=$?
  fi

  if [ $ret -eq 0 ]; then
    _dev_ok "Stash aplicado."
  else
    _dev_err "Falha ao aplicar stash (pode haver conflitos)."
  fi
  sleep 2
}

_stash_drop() {
  local ref
  ref=$(_stash_select_entry) || { _dev_warn "Nenhum stash selecionado."; sleep 1; return 0; }

  local confirm=""
  if _dev_has gum; then
    gum confirm "Descartar $ref definitivamente?" --default=false --affirmative="Sim" --negative="Não" && confirm="yes"
  else
    read -r -p "Descartar $ref definitivamente? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && confirm="yes"
  fi
  [ "$confirm" != "yes" ] && { _dev_warn "Operação cancelada."; sleep 1; return 0; }

  if git stash drop "$ref"; then
    _dev_ok "Stash descartado."
  else
    _dev_err "Falha ao descartar stash."
  fi
  sleep 2
}
