#!/usr/bin/env bash
# ============================================================
# git-switch — Troca para outra branch local
# ============================================================
git-switch() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi
  local target
  target=$(_switch_select_branch)
  if [ -z "$target" ]; then
    return 0
  fi

  _git_auto_stash || { sleep 2; return 1; }

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ git checkout \"$target\"" >&2
  else
    echo "\$ git checkout \"$target\"" >&2
  fi

  _dev_spin "Trocando para '$target'..." git checkout "$target"
  local ret=$?
  if [ $ret -eq 0 ]; then
    _dev_ok "Trocado para branch '$target'."
    _git_auto_unstash
  else
    _dev_err "Falha ao trocar para '$target' (código $ret)."
  fi
  sleep 2
  return $ret
}