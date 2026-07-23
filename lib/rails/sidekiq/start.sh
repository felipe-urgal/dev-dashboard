#!/usr/bin/env bash
# ============================================================
# Iniciar Sidekiq
# ============================================================
_sidekiq_start() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/sidekiq-${id}.pid"
  local log_file="$DEV_RUN_DIR/sidekiq-${id}.log"

  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    _dev_warn "Sidekiq já está em execução (PID $(cat "$pid_file"))."
    sleep 3
    return 1
  fi

  local cmd
  cmd=$(_sidekiq_cmd)
  _dev_ok "Iniciando Sidekiq para $project (background)..."
  nohup bash -c "$cmd" >> "$log_file" 2>&1 &
  local new_pid=$!
  echo $new_pid > "$pid_file"

  sleep 3
  if ! kill -0 "$new_pid" 2>/dev/null; then
    _dev_err "Sidekiq morreu imediatamente. Log ($log_file):"
    tail -n 20 "$log_file" >&2
    rm -f "$pid_file"
    sleep 3
    return 1
  fi

  _dev_ok "Sidekiq iniciado com PID $new_pid. Logs em $log_file"
  sleep 3
}