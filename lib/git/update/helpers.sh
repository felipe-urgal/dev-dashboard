#!/usr/bin/env bash
# ============================================================
# UPDATE HELPERS — Verificação de remote, menu de ações
# ============================================================
_update_get_remote() {
  if git remote get-url upstream &>/dev/null; then
    echo "upstream"
  elif git remote get-url origin &>/dev/null; then
    echo "origin"
  else
    return 1
  fi
}

_update_select_action() {
  local remote="$1"
  local default_branch="${2:-main}"
  _dev_clear
  _dev_breadcrumb "Git" "Atualizar $default_branch"
  echo >&2
  _dev_step "Atualizar a $default_branch a partir de '$remote' e enviar para origin?"
  echo >&2

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Atualizar;Fazer checkout, fetch, merge e push da $default_branch\n"
    rows+="Voltar;Cancelar e voltar ao menu anterior\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -z "$selected" ] && { echo "voltar"; return; }
    local action
    action=$(echo "$selected" | cut -d';' -f1 | xargs)
    case "$action" in
      "Atualizar") echo "atualizar" ;;
      *)           echo "voltar" ;;
    esac
  else
    echo "Atualizar a $default_branch a partir de '$remote'?" >&2
    echo "  1) Atualizar" >&2
    echo "  2) Voltar" >&2
    read -r -p "Número: " choice
    case "$choice" in
      1) echo "atualizar" ;;
      *) echo "voltar" ;;
    esac
  fi
}