#!/usr/bin/env bash
# ============================================================
# Visualizar logs do servidor Rails
# ============================================================

_server_logs() {
  local project="$1"

  if declare -f dev-logs &>/dev/null; then
    dev-logs "$project"
  else
    _dev_err "Função dev-logs não encontrada."
  fi
}