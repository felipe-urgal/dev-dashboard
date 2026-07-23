#!/usr/bin/env bash
# ============================================================
# git-delete — Remove branch local (exceto main/master)
# ============================================================
git-delete() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 3
    return 1
  fi
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    _dev_warn "Existem alterações não commitadas. Faça commit ou stash antes de deletar uma branch."
    sleep 3
    return 1
  fi

  local branch
  branch=$(_delete_select_branch)
  if [ -z "$branch" ]; then
    _dev_warn "Operação cancelada."
    sleep 3
    return 0
  fi

  if ! _delete_confirm "$branch"; then
    _dev_warn "Operação cancelada."
    sleep 3
    return 0
  fi

  if ! _delete_checkout_safe "$branch"; then
    sleep 3
    return 1
  fi

  _dev_clear
  _dev_breadcrumb "Git" "Excluir branch" "Executando"
  echo >&2

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ git branch -D \"$branch\"" >&2
  else
    echo "\$ git branch -D \"$branch\"" >&2
  fi

  _dev_spin "Removendo branch $branch..." git branch -D "$branch"
  local ret=$?
  if [ $ret -eq 0 ]; then
    _dev_ok "Branch removida: $branch"
  else
    _dev_err "Falha ao remover branch '$branch' (código $ret)."
  fi
  sleep 3
  return $ret
}