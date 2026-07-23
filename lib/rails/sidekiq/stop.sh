#!/usr/bin/env bash
# ============================================================
# Parar Sidekiq
# ============================================================
_sidekiq_stop() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/sidekiq-${id}.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
      rm -f "$pid_file"
      _dev_ok "Sidekiq parado (PID $pid)."
    else
      _dev_warn "Processo $pid já não existe."
      rm -f "$pid_file"
    fi
  else
    _dev_warn "Sidekiq não está rodando (sem PID)."
  fi
  sleep 3
}