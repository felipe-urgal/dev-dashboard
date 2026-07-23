#!/usr/bin/env bash
# ============================================================
# Controle de serviços auxiliares
# ============================================================
_dev_port_open() {
  local port="$1"
  command -v lsof >/dev/null && lsof -i ":$port" >/dev/null 2>&1
}

_dev_start_mysql() {
  if _dev_port_open 3306; then
    _dev_ok "MySQL já está em execução (porta 3306)."
    return 0
  fi

  local start_cmd=""
  case "$(_dev_os)" in
    linux)
      if ! _dev_has systemctl; then
        _dev_warn "systemctl não encontrado. Inicie o MySQL manualmente."
        return 1
      fi
      start_cmd="sudo systemctl start mysql.service"
      ;;
    mac)
      if ! _dev_has brew; then
        _dev_warn "brew não encontrado. Inicie o MySQL manualmente."
        return 1
      fi
      start_cmd="brew services start mysql"
      ;;
    *)
      _dev_warn "Não sei iniciar o MySQL nesse sistema, inicie manualmente."
      return 1
      ;;
  esac

  _dev_ok "Iniciando MySQL: $start_cmd"
  local output
  output=$(bash -c "$start_cmd" 2>&1)
  local ret=$?
  if [ $ret -ne 0 ]; then
    _dev_err "Falha ao iniciar o MySQL. Saída:"
    echo "$output" >&2
    return 1
  fi

  local waited=0
  while [ $waited -lt 10 ]; do
    if _dev_port_open 3306; then
      _dev_ok "MySQL iniciado com sucesso (porta 3306)."
      sleep 1
      return 0
    fi
    sleep 1
    ((waited++))
  done

  _dev_err "O comando de start foi executado, mas o MySQL não subiu após 10s."
  return 1
}