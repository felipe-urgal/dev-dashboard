#!/usr/bin/env bash
# ============================================================
# Ver logs do webpack
# ============================================================
_webpack_logs() {
  local project="$1"
  local webpack_log_file="$DEV_RUN_DIR/webpack-$(_dev_project_id "$project").log"

  if [ -f "$webpack_log_file" ]; then
    _dev_ok "Exibindo log do webpack ($webpack_log_file). Ctrl+C para interromper follow, q para sair..."
    trap '' INT
    if _dev_has bat; then
      tail -f "$webpack_log_file" | bat --paging=never -l log
    elif _dev_has lnav; then
      lnav -f "$webpack_log_file"
    elif command -v less &>/dev/null; then
      less -R +F "$webpack_log_file"
    else
      tail -f "$webpack_log_file" | sed \
        -e 's/\(ERROR\|FATAL\|CRITICAL\)/\x1b[31m\1\x1b[0m/gi' \
        -e 's/\(WARN\|WARNING\)/\x1b[33m\1\x1b[0m/gi' \
        -e 's/\(INFO\)/\x1b[32m\1\x1b[0m/gi' \
        -e 's/\(DEBUG\|TRACE\)/\x1b[36m\1\x1b[0m/gi'
    fi
    trap - INT
    _dev_clear
  else
    _dev_err "Arquivo de log não encontrado: $webpack_log_file"
    sleep 3
  fi
}