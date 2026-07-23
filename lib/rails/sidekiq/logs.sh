#!/usr/bin/env bash
# ============================================================
# Ver logs do Sidekiq
# ============================================================
_sidekiq_logs() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local log_file="$DEV_RUN_DIR/sidekiq-${id}.log"

  if [ -f "$log_file" ]; then
    _dev_ok "Exibindo log do Sidekiq ($log_file). Ctrl+C para interromper follow, q para sair..."
    trap '' INT
    if _dev_has bat; then
      tail -f "$log_file" | bat --paging=never -l log
    elif _dev_has lnav; then
      lnav -f "$log_file"
    elif command -v less &>/dev/null; then
      less -R +F "$log_file"
    else
      tail -f "$log_file" | sed \
        -e 's/\(ERROR\|FATAL\|CRITICAL\)/\x1b[31m\1\x1b[0m/gi' \
        -e 's/\(WARN\|WARNING\)/\x1b[33m\1\x1b[0m/gi' \
        -e 's/\(INFO\)/\x1b[32m\1\x1b[0m/gi' \
        -e 's/\(DEBUG\|TRACE\)/\x1b[36m\1\x1b[0m/gi'
    fi
    trap - INT
    _dev_clear
  else
    _dev_err "Arquivo de log não encontrado: $log_file"
    sleep 3
  fi
}