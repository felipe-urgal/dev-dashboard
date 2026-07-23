#!/usr/bin/env bash
# ============================================================
# SYNC HELPERS — Estratégia de sincronização
# ============================================================

_sync_select_strategy() {
  local branch="$1"
  _dev_clear
  _dev_breadcrumb "Git" "Sincronizar branch"
  echo >&2
  _dev_step "Como deseja atualizar a branch '$branch' com o remote?"
  echo >&2

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Rebase;Reaplica seus commits por cima do remote (histórico linear)\n"
    rows+="Merge;Faz merge tradicional das alterações remotas\n"
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
      "Rebase") echo "rebase" ;;
      "Merge")  echo "merge" ;;
      *)        echo "voltar" ;;
    esac
  else
    echo "Como deseja atualizar a branch '$branch'?" >&2
    echo "  1) Rebase (histórico linear)" >&2
    echo "  2) Merge" >&2
    echo "  3) Voltar" >&2
    read -r -p "Número: " choice
    case "$choice" in
      1) echo "rebase" ;;
      2) echo "merge" ;;
      *) echo "voltar" ;;
    esac
  fi
}
