#!/usr/bin/env bash
# ============================================================
# SERVER COMMANDS — Comandos públicos (stop, clean, kill)
# ============================================================

dev-clean() {
  local quiet=false
  [[ "$1" == "--quiet" ]] && quiet=true

  local cleaned=0
  local retention_days="${DEV_DASHBOARD_LOG_RETENTION_DAYS:-7}"
  [[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || retention_days=7

  local pid_file
  for pid_file in "$DEV_RUN_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local pid
    pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      _dev_warn "Removido PID órfão: $(basename "$pid_file")"
      ((cleaned++))
    fi
  done

  local log_file
  for log_file in "$DEV_RUN_DIR"/*.log; do
    [ -f "$log_file" ] || continue
    local id
    id=$(basename "$log_file" .log)
    local pid_file="$DEV_RUN_DIR/${id}.pid"
    [ -f "$pid_file" ] && continue
    if [ -z "$(find "$log_file" -mtime "+${retention_days}" 2>/dev/null)" ]; then
      continue
    fi
    rm -f "$log_file"
    _dev_warn "Removido log antigo: $(basename "$log_file")"
    ((cleaned++))
  done

  if [ $cleaned -eq 0 ] && ! $quiet; then
    _dev_ok "Nenhum PID ou log obsoleto encontrado."
  fi
}

dev-stop() {
  local project="$1"

  if _dev_dashboard_api_available; then
    if _dev_dashboard_stop "$project" >/dev/null; then
      _dev_ok "Servidor $project encerrado pelo Process Manager."
      return 0
    fi
    _dev_err "Não foi possível encerrar $project pelo Process Manager."
    return 1
  fi

  # Fallback standalone: encerra apenas processos que o dev-tools registrou.
  # Porta ocupada sem PID owned nunca é tratada como autoridade para kill.
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/${id}.pid"

  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      _dev_ok "Encerrando servidor $project (PID $pid)..."
      kill -TERM "$pid" 2>/dev/null
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        _dev_warn "Processo owned não encerrou; enviando SIGKILL."
        kill -KILL "$pid" 2>/dev/null
      fi
      pkill -P "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  else
    _dev_warn "API indisponível e nenhum processo owned registrado para '$project'."
  fi

  local webpack_pid_file="$DEV_RUN_DIR/webpack-$(_dev_project_id "$project").pid"
  if [ -f "$webpack_pid_file" ]; then
    local wp_pid
    wp_pid=$(cat "$webpack_pid_file")
    if kill -0 "$wp_pid" 2>/dev/null; then
      kill -TERM "$wp_pid" 2>/dev/null || true
    fi
    rm -f "$webpack_pid_file"
  fi
}
dev-stop-all() {
  if _dev_dashboard_api_available; then
    if _dev_dashboard_stop_all >/dev/null; then
      _dev_ok "Todos os servidores owned foram parados pelo Process Manager."
      return 0
    fi
    _dev_err "Uma ou mais paradas falharam no Process Manager."
    return 1
  fi

  local -a projects
  readarray -t projects < <(project-list)
  for p in "${projects[@]}"; do
    dev-stop "$p"
  done
  dev-clean
  _dev_ok "Fallback standalone concluído apenas para processos registrados pelo dev-tools."
}

dev-kill-port() {
  local port="$1"
  [ -z "$port" ] && { _dev_err "Informe a porta: dev-kill-port 3002"; return 1; }
  _kill_port "$port"
}

# ------------------------------------------------------------
# dev-restart
# Reinicia o servidor de um projeto (stop + start conforme o tipo)
# ------------------------------------------------------------
dev-restart() {
  local project="$1"
  [ -z "$project" ] && { _dev_err "Informe o projeto: dev-restart <projeto>"; return 1; }

  if _dev_dashboard_api_available; then
    _dev_ok "Reiniciando $project pelo Process Manager..."
    dev-stop "$project" || return 1
    sleep 1
    _dev_dashboard_start "$project" >/dev/null || {
      _dev_err "Não foi possível reiniciar '$project' pelo Process Manager."
      return 1
    }
    _dev_ok "Servidor $project reiniciado."
    return 0
  fi

  local type
  type=$(project-type "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    return 1
  }

  _dev_ok "Reiniciando $project..."
  dev-stop "$project"
  sleep 1

  case "$type" in
    rails)
      _dev_start_server "$project" "bin/rails server" "" "rails" || return 1
      local port
      port=$(project-port "$project") || port=""
      if [ -n "$port" ] && ! _wait_for_port "$port" 60; then
        _dev_warn "Servidor iniciado, mas a porta $port não respondeu a tempo. Verifique os logs."
        return 1
      fi
      _dev_ok "Servidor $project reiniciado."
      ;;
    node)
      if declare -f _node_server_start &>/dev/null; then
        _node_server_start "$project" || return 1
      else
        _dev_err "Módulo Node não carregado. Não foi possível reiniciar '$project'."
        return 1
      fi
      ;;
    *)
      _dev_err "Tipo de projeto desconhecido: $type"
      return 1
      ;;
  esac
}

# ------------------------------------------------------------
# dev-start-all
# Inicia todos os servidores que estão parados (Rails e Node)
# ------------------------------------------------------------
dev-start-all() {
  if _dev_dashboard_api_available; then
    if _dev_dashboard_start_all >/dev/null; then
      _dev_ok "Servidores iniciados pelo Process Manager."
      return 0
    fi
    _dev_err "Uma ou mais inicializações falharam no Process Manager."
    return 1
  fi

  local -a projects
  readarray -t projects < <(project-list)

  if [ ${#projects[@]} -eq 0 ]; then
    _dev_warn "Nenhum projeto encontrado."
    return 0
  fi

  _dev_ok "Iniciando todos os servidores..."
  local started=0 skipped=0 failed=0

  local project
  for project in "${projects[@]}"; do
    local port type
    port=$(project-port "$project") || port=""
    type=$(project-type "$project") || type=""

    if [ -n "$port" ] && _is_port_in_use "$port"; then
      _dev_ok "$project já está rodando (porta $port). Pulando..."
      ((skipped++))
      continue
    fi

    case "$type" in
      rails)
        _dev_ok "Iniciando $project (Rails)..."
        if _dev_start_server "$project" "bin/rails server" "" "rails"; then
          ((started++))
        else
          ((failed++))
          _dev_err "Falha ao iniciar $project. Verifique os logs."
        fi
        ;;

      node)
        if declare -f _node_server_start &>/dev/null; then
          _dev_ok "Iniciando $project (Node) via módulo Node..."
          if _node_server_start "$project"; then
            ((started++))
          else
            ((failed++))
            _dev_err "Falha ao iniciar $project (Node)."
          fi
        else
          local node_path
          node_path=$(project-path "$project") || node_path=""
          if [ -z "$node_path" ] || [ ! -f "$node_path/package.json" ]; then
            _dev_warn "$project: package.json não encontrado. Pulando..."
            ((skipped++))
            continue
          fi
          local pkg_manager=""
          if _dev_has yarn && [ -f "$node_path/yarn.lock" ]; then
            pkg_manager="yarn"
          elif _dev_has npm; then
            pkg_manager="npm"
          else
            _dev_warn "$project: gerenciador de pacotes não identificado. Pulando..."
            ((skipped++))
            continue
          fi
          if ! grep -q '"dev"' "$node_path/package.json" 2>/dev/null; then
            _dev_warn "$project: script 'dev' não encontrado no package.json. Pulando..."
            ((skipped++))
            continue
          fi
          _dev_ok "Iniciando $project (Node) com $pkg_manager dev..."
          if _dev_start_server "$project" "$pkg_manager dev" "" "node"; then
            ((started++))
          else
            ((failed++))
            _dev_err "Falha ao iniciar $project (Node)."
          fi
        fi
        ;;

      *)
        _dev_warn "$project: tipo desconhecido ($type). Pulando..."
        ((skipped++))
        ;;
    esac
  done

  echo >&2
  _dev_ok "Inicialização concluída: $started iniciado(s), $skipped pulado(s), $failed falha(s)."
  _dev_pause
}