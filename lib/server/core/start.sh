#!/usr/bin/env bash
# ============================================================
# SERVER START — Iniciar servidor
# ============================================================
_dev_start_server() {
  dev-clean --quiet

  local project="$1"
  local cmd_base="$2"
  local pre_hook_func="$3"
  local type="$4"

  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/${id}.pid"
  local log_file="$DEV_RUN_DIR/${id}.log"

  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    _dev_warn "Servidor $project já está em execução (PID $(cat "$pid_file"))."
    return 1
  fi

  local path
  path=$(project-path "$project") || { _dev_err "Projeto '$project' não encontrado."; return 1; }
  _dev_cd "$path" || return 1

  local port
  port=$(project-port "$project") || { _dev_err "Porta não definida para '$project'."; return 1; }
  _dev_ok "Porta configurada para $project: $port"

  if _is_port_in_use "$port"; then
    _dev_warn "Porta $port está ocupada."
    local kill_confirm
    if _dev_has gum; then
      gum confirm "" --default=false --affirmative="Sim" --negative="Não" && kill_confirm="yes"
    else
      read -r -p "Matar processo na porta $port? (s/N) " answer
      [[ "$answer" =~ ^[Ss] ]] && kill_confirm="yes"
    fi
    if [[ "$kill_confirm" == "yes" ]]; then
      _kill_port "$port"
    else
      _dev_warn "Inicialização cancelada."
      return 1
    fi
  fi

  if [[ -n "$pre_hook_func" ]] && declare -f "$pre_hook_func" &>/dev/null; then
    "$pre_hook_func" || { _dev_err "Pre-hook ($pre_hook_func) falhou."; return 1; }
  fi

  local cmd
  if [ "$type" = "rails" ]; then
    cmd="$cmd_base -p $port -b 0.0.0.0"
  else
    cmd="$cmd_base"
  fi

  _dev_ok "Comando: $cmd"
  _dev_ok "Iniciando servidor para $project (background)..."

  nohup bash -c "$cmd" >> "$log_file" 2>&1 &
  local pid=$!
  echo $pid > "$pid_file"

  sleep 1
  if ! kill -0 "$pid" 2>/dev/null; then
    _dev_err "Servidor morreu imediatamente. Log ($log_file):"
    tail -n 20 "$log_file" >&2
    rm -f "$pid_file"
    return 1
  fi

  _dev_ok "Servidor iniciado com PID $pid. Logs em $log_file"
}