#!/usr/bin/env bash
# ============================================================
# git-stash — Gerenciar stashes (salvar, aplicar, descartar)
# ============================================================
git-stash() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi

  while true; do
    _dev_clear
    _dev_breadcrumb "Git" "Stash"
    echo >&2

    local stash_count
    stash_count=$(git stash list | wc -l)
    if [ "$stash_count" -gt 0 ]; then
      _dev_step "Stashes salvos ($stash_count):"
      _stash_list | sed 's/^/  /' >&2
    else
      _dev_step "Nenhum stash salvo no momento."
    fi
    echo >&2

    local action
    action=$(_stash_menu_show "$stash_count")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Salvar")    _stash_save ;;
      "Aplicar")   _stash_apply ;;
      "Descartar") _stash_drop ;;
    esac
  done
}
