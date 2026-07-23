#!/usr/bin/env bash
# ============================================================
# HEALTH HELPERS — Verificação de saúde dos servidores
# ============================================================

# Verifica a saúde do servidor de um projeto.
# Retorna via stdout: "running", "crashed", "stopped" ou "unresponsive".
#   running      → processo vivo e porta respondendo
#   crashed      → PID file existe mas o processo morreu (remove o PID file)
#   stopped      → sem PID file e porta livre
#   unresponsive → processo vivo mas a porta não responde HTTP
_health_check_server() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/${id}.pid"
  local port
  port=$(project-port "$project") || port=""

  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
      # Processo morreu deixando o PID file para trás
      rm -f "$pid_file"
      echo "crashed"
      return 0
    fi
    # Processo vivo: verifica se a porta responde
    if [ -n "$port" ] && _is_port_in_use "$port"; then
      if _dev_has curl; then
        if curl -s -o /dev/null --max-time 3 "http://localhost:$port"; then
          echo "running"
        else
          echo "unresponsive"
        fi
      else
        # Sem curl: porta aberta já é bom sinal
        echo "running"
      fi
    else
      echo "unresponsive"
    fi
    return 0
  fi

  # Sem PID file: pode ter sido iniciado fora do dashboard
  if [ -n "$port" ] && _is_port_in_use "$port"; then
    echo "running"
  else
    echo "stopped"
  fi
}

# Rótulo amigável para cada status de saúde.
_health_status_label() {
  case "$1" in
    running)      echo "🟢 rodando" ;;
    crashed)      echo "💥 crashou" ;;
    unresponsive) echo "🟡 não responde" ;;
    stopped)      echo "🔴 parado" ;;
    *)            echo "❓ desconhecido" ;;
  esac
}
