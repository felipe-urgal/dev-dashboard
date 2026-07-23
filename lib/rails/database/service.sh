#!/usr/bin/env bash
# ============================================================
# Gerenciar serviço do banco de dados (iniciar/parar)
# ============================================================
_dev_start_database() {
  local adapter="$1"
  local port="$2"
  local start_cmd=""
  local service_name=""

  case "$adapter" in
    mysql2|mysql)
      service_name="MySQL"
      case "$(_dev_os)" in
        linux) start_cmd="sudo systemctl start mysql.service" ;;
        mac)   start_cmd="brew services start mysql" ;;
        *)     _dev_warn "Não sei iniciar o MySQL neste sistema."; return 1 ;;
      esac
      ;;
    postgresql)
      service_name="PostgreSQL"
      case "$(_dev_os)" in
        linux) start_cmd="sudo systemctl start postgresql.service" ;;
        mac)   start_cmd="brew services start postgresql" ;;
        *)     _dev_warn "Não sei iniciar o PostgreSQL neste sistema."; return 1 ;;
      esac
      ;;
    *)
      _dev_err "Adaptador de banco desconhecido: $adapter"
      return 1
      ;;
  esac

  _dev_ok "Iniciando $service_name: $start_cmd"
  local output
  output=$(bash -c "$start_cmd" 2>&1)
  local ret=$?

  if [ $ret -ne 0 ]; then
    _dev_err "Falha ao iniciar $service_name. Saída do comando:"
    echo "$output" >&2
    return 1
  fi

  local waited=0
  while [ $waited -lt 10 ]; do
    if _dev_database_running; then
      _dev_ok "$service_name iniciado com sucesso (porta $port)."
      sleep 3
      return 0
    fi
    sleep 3
    ((waited++))
  done

  _dev_err "O comando foi executado, mas $service_name não está acessível na porta $port após 10s."
  return 1
}

_dev_stop_database() {
  local adapter="$1"
  local port="$2"
  local stop_cmd=""
  local service_name=""

  case "$adapter" in
    mysql2|mysql)
      service_name="MySQL"
      case "$(_dev_os)" in
        linux) stop_cmd="sudo systemctl stop mysql.service" ;;
        mac)   stop_cmd="brew services stop mysql" ;;
        *)     _dev_warn "Não sei parar o MySQL neste sistema."; return 1 ;;
      esac
      ;;
    postgresql)
      service_name="PostgreSQL"
      case "$(_dev_os)" in
        linux) stop_cmd="sudo systemctl stop postgresql.service" ;;
        mac)   stop_cmd="brew services stop postgresql" ;;
        *)     _dev_warn "Não sei parar o PostgreSQL neste sistema."; return 1 ;;
      esac
      ;;
    *)
      _dev_err "Adaptador de banco desconhecido: $adapter"
      return 1
      ;;
  esac

  _dev_ok "Parando $service_name: $stop_cmd"
  local output
  output=$(bash -c "$stop_cmd" 2>&1)
  local ret=$?

  if [ $ret -ne 0 ]; then
    _dev_err "Falha ao parar $service_name. Saída do comando:"
    echo "$output" >&2
    _dev_warn "Verifique suas permissões. Pode ser necessário sudo ou intervir manualmente."
    return 1
  fi

  sleep 3
  if _dev_database_running; then
    _dev_warn "O comando foi executado, mas $service_name ainda está rodando (porta $port)."
    return 1
  else
    _dev_ok "$service_name parado com sucesso."
    sleep 3
    return 0
  fi
}

_dev_manage_database_service() {
  local project="$1"
  local path="$2"
  local adapter
  adapter=$(_dev_detect_adapter)
  local port
  port=$(_dev_database_port)

  if [ -z "$adapter" ] || [ -z "$port" ]; then
    _dev_err "Não foi possível detectar o banco de dados. Verifique o config/database.yml."
    sleep 3
    return 1
  fi

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Rails" "Banco" "Serviço"
    echo >&2
    _dev_step "Inicie ou pare o serviço de banco de dados ($adapter, porta $port)."
    echo >&2

    local is_running=false
    _dev_database_running && is_running=true

    local -a options=()
    if $is_running; then
      options+=("Parar serviço do banco")
    else
      options+=("Iniciar serviço do banco")
    fi
    options+=("Voltar")

    local action=""
    if _dev_has gum; then
      local rows="Ação\n"
      local opt
      for opt in "${options[@]}"; do
        rows+="$opt\n"
      done
      local selected
      selected=$(printf "%b" "$rows" | gum table \
        --separator=";" \
        --border="rounded" \
        --border.foreground="#7C3AED" \
        --header.foreground="#7C3AED")
      [ -n "$selected" ] && action=$(echo "$selected" | cut -d';' -f1 | xargs)
    else
      echo "Serviço do banco:" >&2
      local i=1
      for opt in "${options[@]}"; do
        echo "  $i) $opt" >&2
        ((i++))
      done
      read -r -p "Escolha uma opção: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
        action="${options[$((choice-1))]}"
      fi
    fi

    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Iniciar serviço do banco") _dev_start_database "$adapter" "$port" ;;
      "Parar serviço do banco")   _dev_stop_database "$adapter" "$port" ;;
    esac
  done
}