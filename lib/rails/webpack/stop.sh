#!/usr/bin/env bash
# ============================================================
# Parar webpack-dev-server
# ============================================================
_webpack_stop() {
  local project="$1"
  local webpack_pid_file="$DEV_RUN_DIR/webpack-$(_dev_project_id "$project").pid"
  if [ -f "$webpack_pid_file" ]; then
    local wp_pid
    wp_pid=$(cat "$webpack_pid_file")
    if kill -0 "$wp_pid" 2>/dev/null; then
      kill -TERM "$wp_pid" 2>/dev/null || kill -KILL "$wp_pid" 2>/dev/null
      rm -f "$webpack_pid_file"
      _dev_ok "Webpack parado (PID $wp_pid)."
    else
      rm -f "$webpack_pid_file"
      _dev_warn "Webpack já não está rodando."
    fi
  else
    _dev_warn "Não há registro de webpack para '$project'."
  fi
  sleep 3
}