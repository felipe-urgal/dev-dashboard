#!/usr/bin/env bash
# ============================================================
# Reiniciar Sidekiq (parar e iniciar)
# ============================================================
_sidekiq_restart() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/sidekiq-${id}.pid"
  local log_file="$DEV_RUN_DIR/sidekiq-${id}.log"

  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
      rm -f "$pid_file"
      _dev_ok "Sidekiq anterior parado (PID $pid)."
    else
      rm -f "$pid_file"
    fi
  fi

  local cmd
  cmd=$(_sidekiq_cmd)
  _dev_ok "Iniciando Sidekiq para $project (background)..."
  nohup bash -c "$cmd" >> "$log_file" 2>&1 &
  local new_pid=$!
  echo $new_pid > "$pid_file"

  sleep 2
  if ! kill -0 "$new_pid" 2>/dev/null; then
    _dev_err "Sidekiq morreu imediatamente. Log ($log_file):"
    tail -n 20 "$log_file" >&2
    rm -f "$pid_file"
    sleep 3
    return 1
  fi

  _dev_ok "Sidekiq reiniciado com PID $new_pid."
  sleep 3
}