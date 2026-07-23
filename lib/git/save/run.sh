#!/usr/bin/env bash
# ============================================================
# git-save — Commit rápido com mensagem convencional
# ============================================================
git-save() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi

  local message="${*}"
  if [ -z "$message" ]; then
    _dev_err "Informe a mensagem do commit. Uso: git-save \"mensagem do commit\""
    sleep 2
    return 1
  fi

  local prefix
  prefix=$(_save_prefix)
  _save_commit "$message" "$prefix"
  return $?
}