#!/usr/bin/env bash
# ============================================================
# Navegação segura entre diretórios
# ============================================================

_dev_cd() {
  if [ -d "$1" ]; then
    cd "$1" || return 1
  else
    _dev_err "Pasta não encontrada: $1"
    return 1
  fi
}