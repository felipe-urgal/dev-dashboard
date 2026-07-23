#!/usr/bin/env bash
# ============================================================
# git-sync — Atualiza a branch atual com o remote
# ============================================================
git-sync() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi

  local branch
  branch=$(git branch --show-current)
  if [ -z "$branch" ]; then
    _dev_err "Não foi possível identificar a branch atual (detached HEAD?)."
    sleep 2
    return 1
  fi

  if ! git rev-parse --abbrev-ref "@{u}" &>/dev/null; then
    _dev_warn "A branch '$branch' não possui tracking remoto. Publique-a primeiro (git-publish)."
    sleep 3
    return 1
  fi

  local strategy
  strategy=$(_sync_select_strategy "$branch")
  if [ "$strategy" = "voltar" ]; then
    _dev_warn "Operação cancelada."
    sleep 1
    return 0
  fi

  _git_auto_stash || { sleep 2; return 1; }

  local cmd
  if [ "$strategy" = "rebase" ]; then
    cmd="git pull --rebase"
  else
    cmd="git pull"
  fi

  _dev_clear
  _dev_breadcrumb "Git" "Sincronizar branch" "Executando"
  echo >&2

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ $cmd" >&2
  else
    echo "\$ $cmd" >&2
  fi

  _dev_spin "Sincronizando '$branch'..." bash -c "$cmd"
  local ret=$?
  if [ $ret -eq 0 ]; then
    _dev_ok "Branch '$branch' sincronizada com o remote."
  else
    _dev_err "Falha ao sincronizar (código $ret). Verifique conflitos."
  fi

  _git_auto_unstash
  sleep 2
  return $ret
}
