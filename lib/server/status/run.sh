#!/usr/bin/env bash
# ============================================================
# SERVER/STATUS — Relatórios de status dos servidores
# ============================================================
# Depende de:
#   server/core (_dev_project_id, _is_port_in_use)
#   projects    (project-list, project-port, project-has-webpack)
# ============================================================

# ------------------------------------------------------------
# dev-servers
# Lista servidores em execução, inclusive processos sem porta conhecida
# ------------------------------------------------------------
dev-servers() {
  _dev_step "Servidores em execução:"
  local found=0
  local -A listed_ids=()   # chave = project_id, valor = PID já exibido

  local -a projects
  readarray -t projects < <(project-list)

  local project
  # Varredura por porta configurada
  for project in "${projects[@]}"; do
    local port
    port=$(project-port "$project") || continue
    [ -z "$port" ] && continue
    if _is_port_in_use "$port"; then
      local pids
      pids=$(lsof -t -i :"$port" 2>/dev/null)
      for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o command= 2>/dev/null | head -n1 | cut -c1-50)
        _dev_ok "$project (porta $port) → PID $pid: ${cmd:-<desconhecido>}"
        listed_ids["$(_dev_project_id "$project")"]="$pid"
        found=1
      done
    fi
  done

  # Varredura por PID files (processos que podem não estar associados a uma porta)
  local pid_file
  for pid_file in "$DEV_RUN_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local pid
    pid=$(cat "$pid_file")
    local id
    id=$(basename "$pid_file" .pid)

    if kill -0 "$pid" 2>/dev/null; then
      [[ -n "${listed_ids[$id]}" ]] && continue

      local cmd
      cmd=$(ps -p "$pid" -o command= 2>/dev/null | head -n1)
      _dev_warn "$id (PID $pid) → ${cmd:-<desconhecido>} (ativo, mas sem porta conhecida)"
      found=1
    else
      _dev_err "$id → processo $pid morreu (crash?). Veja os logs: $DEV_RUN_DIR/${id}.log"
      rm -f "$pid_file"
      found=1
    fi
  done

  [ $found -eq 0 ] && _dev_warn "Nenhum servidor em execução."
  return 0
}

# ------------------------------------------------------------
# dev-status
# Breve resumo: servidores ativos + ocupação de portas
# ------------------------------------------------------------
dev-status() {
  _dev_step "Verificando servidores e portas..."
  echo >&2
  dev-servers
  echo >&2

  local -a projects
  readarray -t projects < <(project-list)

  local project
  for project in "${projects[@]}"; do
    local port
    port=$(project-port "$project") || continue
    if _is_port_in_use "$port"; then
      local pids
      pids=$(lsof -t -i :"$port" 2>/dev/null)
      if [ -n "$pids" ]; then
        for pid in $pids; do
          local cmd
          cmd=$(ps -p "$pid" -o command= 2>/dev/null | head -n1)
          _dev_ok "Porta $port → ocupada por PID $pid: ${cmd:-<desconhecido>}"
        done
      fi
    else
      _dev_warn "Porta $port → livre"
    fi
  done
}

# ------------------------------------------------------------
# dev-status-all
# Status detalhado de cada projeto (servidor + webpack)
# ------------------------------------------------------------
dev-status-all() {
  _dev_step "Status dos projetos:"
  echo >&2

  local -a projects
  readarray -t projects < <(project-list)

  local project
  for project in "${projects[@]}"; do
    local port has_webpack id pid_file managed_pid
    port=$(project-port "$project") || port=""
    has_webpack=$(project-has-webpack "$project")
    id=$(_dev_project_id "$project")
    pid_file="$DEV_RUN_DIR/${id}.pid"
    managed_pid=$(_dev_live_pid_from_file "$pid_file") || managed_pid=""

    if [ -n "$port" ] && _is_port_in_use "$port"; then
      local owner_pid owner_cmd pid_info
      owner_pid=$(lsof -t -i :"$port" 2>/dev/null | head -n1)
      owner_cmd=""
      pid_info="processo desconhecido"
      if [ -n "$owner_pid" ]; then
        owner_cmd=$(ps -p "$owner_pid" -o command= 2>/dev/null | head -n1 | cut -c1-50)
        pid_info="PID $owner_pid ${owner_cmd:+$owner_cmd}"
      fi

      if [ -n "$managed_pid" ]; then
        local managed_cmd
        managed_cmd=$(ps -p "$managed_pid" -o command= 2>/dev/null | head -n1 | cut -c1-50)
        _dev_ok "$project (porta $port) → rodando (PID $managed_pid ${managed_cmd:+$managed_cmd})"
      elif _dev_port_owned_by_docker "$owner_cmd"; then
        _dev_warn "$project (porta $port) → ocupada por container Docker, não pelo servidor local (${pid_info})"
      else
        _dev_warn "$project (porta $port) → ocupada por outro processo, não gerenciado por este dashboard (${pid_info})"
      fi
    elif [ -n "$managed_pid" ]; then
      _dev_warn "$project (porta ${port:-N/A}) → processo gerenciado ativo (PID $managed_pid), mas a porta não está respondendo"
    else
      _dev_err "$project (porta ${port:-N/A}) → parado"
    fi

    if [ "$has_webpack" = "yes" ]; then
      local webpack_pid_file="$DEV_RUN_DIR/webpack-$(_dev_project_id "$project").pid"
      if [ -f "$webpack_pid_file" ]; then
        local wp_pid
        wp_pid=$(cat "$webpack_pid_file")
        if kill -0 "$wp_pid" 2>/dev/null; then
          _dev_ok "    Webpack: rodando (PID $wp_pid)"
        else
          _dev_err "    Webpack: parado (PID obsoleto)"
        fi
      else
        _dev_warn "    Webpack: não iniciado"
      fi
    fi
  done
}
