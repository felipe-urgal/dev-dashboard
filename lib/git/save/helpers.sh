#!/usr/bin/env bash
# ============================================================
# SAVE HELPERS — Prefixo e montagem da mensagem
# ============================================================
_save_prefix() {
  _git_branch_prefix
}

_save_commit() {
  local message="$1"
  local prefix="$2"
  local commit_msg
  if [ -n "$prefix" ]; then
    commit_msg="${prefix}: ${message}"
  else
    commit_msg="${message}"
  fi

  _dev_spin "Criando commit..." bash -c 'git add . && git commit -m "$0"' "$commit_msg"
  local ret=$?

  if [ $ret -eq 0 ]; then
    _dev_ok "Commit realizado"
    if _dev_has gum; then
      gum style --foreground="#6B7280" "$commit_msg" >&2
    else
      echo "  $commit_msg" >&2
    fi
  else
    _dev_err "Falha ao commitar (código $ret)."
  fi
  return $ret
}