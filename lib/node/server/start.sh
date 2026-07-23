#!/usr/bin/env bash
# ============================================================
# Iniciar servidor Node
# ============================================================
_node_server_start() {
  local project="$1"

  _dev_cd "$(project-path "$project")" || {
    _dev_err "Não foi possível acessar o diretório do projeto '$project'."
    sleep 3
    return 1
  }

  _node_select_env || { _dev_warn "Inicialização cancelada."; sleep 3; return 1; }

  local server_cmd
  server_cmd=$(_node_dev_cmd)
  if [ -z "$server_cmd" ]; then
    _dev_err "Não foi possível determinar o comando de desenvolvimento (yarn dev ou npm run dev)."
    sleep 3
    return 1
  fi

  local port
  port=$(project-port "$project")

  if [ -n "$port" ] && _node_server_running "$port"; then
    _dev_warn "Servidor já está em execução na porta $port."
    local stop_first=false
    if _dev_has gum; then
      gum confirm "Parar o servidor atual e reiniciar?" --affirmative="Sim" --negative="Não" && stop_first=true
    else
      read -r -p "Parar e reiniciar? (s/N) " answer
      [[ "$answer" =~ ^[Ss] ]] && stop_first=true
    fi
    if $stop_first; then
      dev-stop "$project"
    else
      _dev_warn "Inicialização cancelada."
      sleep 3
      return 1
    fi
  fi

  if ! _dev_start_server "$project" "$server_cmd" "" "node"; then
    _dev_err "Não foi possível iniciar o servidor de '$project'."
    sleep 3
    return 1
  fi

  local final_port
  final_port=$(project-port "$project")
  if _wait_for_port "$final_port" 60; then
    dev-open "$project"
  else
    _dev_warn "Servidor iniciado, mas a porta não respondeu a tempo. Verifique os logs."
  fi
  sleep 3
}