#!/usr/bin/env bash
# ============================================================
# SERVER HELPERS — Detecção de status e interface do menu
# ============================================================
_SERVER_PID=""

_server_running() {
  local project="$1"
  local port
  port=$(project-port "$project") || return 1
  if [ -n "$port" ]; then
    if declare -f _is_port_in_use &>/dev/null; then
      _is_port_in_use "$port" || return 1
    else
      lsof -i :"$port" >/dev/null 2>&1 || return 1
    fi
    _SERVER_PID=$(lsof -t -i :"$port" 2>/dev/null | head -n1)
    return 0
  fi
  return 1
}

_server_menu_show() {
  local is_running="$1"
  local port="$2"
  local pid="$3"
  local -a options=()
  if $is_running; then
    options+=("Parar servidor" "Reiniciar servidor" "Ver logs")
  else
    options+=("Iniciar servidor")
  fi
  options+=("Voltar")

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    $is_running && rows+="Parar servidor;Parar servidor Rails (porta $port, PID $pid)\n"
    $is_running && rows+="Reiniciar servidor;Parar e iniciar novamente o servidor\n"
    $is_running && rows+="Ver logs;Exibir logs do servidor\n"
    ! $is_running && rows+="Iniciar servidor;Iniciar Rails server em segundo plano\n"
    rows+="Voltar;Voltar ao menu Rails\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    echo "Servidor Rails:" >&2
    local i=1
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha uma opção: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
      echo "${options[$((choice-1))]}"
    fi
  fi
}