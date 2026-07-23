#!/usr/bin/env bash
# ============================================================
# Parar servidor Rails
# ============================================================
_server_stop() {
  local project="$1"
  if declare -f dev-stop &>/dev/null; then
    dev-stop "$project"
  else
    _dev_err "Função dev-stop não encontrada."
  fi
  sleep 3
}