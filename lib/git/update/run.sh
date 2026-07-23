#!/usr/bin/env bash
# ============================================================
# git-update — Atualiza branch main com upstream
# ============================================================
git-update() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 3
    return 1
  fi
  local remote
  remote=$(_update_get_remote)
  if [ -z "$remote" ]; then
    _dev_err "Nenhum remote 'upstream' ou 'origin' configurado."
    sleep 3
    return 1
  fi

  local default_branch
  default_branch=$(_git_default_branch)

  local action
  action=$(_update_select_action "$remote" "$default_branch")

  if [ "$action" = "voltar" ]; then
    _dev_warn "Operação cancelada."
    sleep 1
    return 0
  fi

  local orig_branch
  orig_branch=$(git branch --show-current)

  _git_auto_stash || { sleep 2; return 1; }

  local cmd="git checkout $default_branch && git fetch $remote && git fetch -p && git merge $remote/$default_branch && git push origin $default_branch"

  _dev_clear
  _dev_breadcrumb "Git" "Atualizar $default_branch" "Executando"
  echo >&2

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ $cmd" >&2
  else
    echo "\$ $cmd" >&2
  fi

  _dev_ok "Atualizando $default_branch a partir de $remote..."
  _dev_spin "Atualizando $default_branch..." bash -c "$cmd"
  local ret=$?
  if [ $ret -eq 0 ]; then
    _dev_ok "Branch $default_branch atualizada com sucesso."
  else
    _dev_err "Falha ao atualizar $default_branch (código $ret)."
  fi

  # Se houve stash, volta para a branch original antes de restaurar,
  # para o pop não cair na branch principal.
  if [ "${DEV_STASH_APPLIED:-0}" = "1" ] && [ -n "$orig_branch" ] && [ "$orig_branch" != "$default_branch" ]; then
    _dev_ok "Voltando para a branch '$orig_branch'..."
    git checkout -q "$orig_branch"
  fi
  _git_auto_unstash
  sleep 3
  return $ret
}