#!/usr/bin/env bash
# ============================================================
# Status do Sidekiq
# ============================================================
_sidekiq_status() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/sidekiq-${id}.pid"
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    local pid
    pid=$(cat "$pid_file")
    _dev_ok "Sidekiq está rodando (PID $pid)."
  else
    _dev_warn "Sidekiq não está rodando."
  fi
  sleep 3
}