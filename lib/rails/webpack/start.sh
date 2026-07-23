#!/usr/bin/env bash
# ============================================================
# Iniciar webpack-dev-server
# ============================================================
_webpack_start() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/webpack-${id}.pid"
  local log_file="$DEV_RUN_DIR/webpack-${id}.log"

  local cmd
  cmd=$(_webpack_cmd) || {
    _dev_err "Não foi possível encontrar o binário do webpack-dev-server."
    sleep 3
    return 1
  }

  _dev_ok "Iniciando webpack-dev-server para $project (background)..."
  nohup bash -c "$cmd" >> "$log_file" 2>&1 &
  local new_pid=$!
  echo $new_pid > "$pid_file"

  sleep 2
  if ! kill -0 "$new_pid" 2>/dev/null; then
    _dev_err "Webpack morreu imediatamente. Log ($log_file):"
    tail -n 20 "$log_file" >&2
    rm -f "$pid_file"
    sleep 3
    return 1
  fi

  _dev_ok "Webpack iniciado com PID $new_pid. Logs em $log_file"
  sleep 3
}