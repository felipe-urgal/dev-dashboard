#!/usr/bin/env bash
# ============================================================
# git-new — Cria nova branch com tipo e nome
# ============================================================
git-new() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi
  local type
  local name
  type=$(_new_select_type)
  [ -z "$type" ] && return 0

  name=$(_new_ask_name "$type")
  [ -z "$name" ] && return 0

  name=$(_new_sanitize_name "$name")
  if [ -z "$name" ]; then
    _dev_err "Nome da branch ficou inválido após sanitização."
    sleep 1
    return 1
  fi

  local branch="${type}/${name}"

  if _new_branch_exists "$branch"; then
    _dev_err "A branch '$branch' já existe."
    sleep 2
    return 1
  fi

  if ! _new_confirm_create "$branch"; then
    _dev_warn "Operação cancelada."
    sleep 2
    return 0
  fi

  _git_auto_stash || { sleep 2; return 1; }

  _dev_ok "Criando branch: $branch"

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ git checkout -b \"$branch\"" >&2
  else
    echo "\$ git checkout -b \"$branch\"" >&2
  fi

  _dev_spin "Executando checkout..." git checkout -b "$branch"
  local ret=$?
  if [ $ret -eq 0 ]; then
    _dev_ok "Branch criada com sucesso: $branch"
    _git_auto_unstash
  else
    _dev_err "Falha ao criar branch $branch (código $ret)."
  fi
  sleep 3
  return $ret
}