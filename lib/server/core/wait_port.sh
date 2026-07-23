#!/usr/bin/env bash
# ============================================================
# WAIT PORT — Aguardar porta ficar disponível
# ============================================================
_check_port() {
  local port="$1"
  lsof -i :"$port" >/dev/null 2>&1 && return 0
  command -v ss >/dev/null && ss -lnt | grep -q ":$port " && return 0
  command -v netstat >/dev/null && netstat -lnt | grep -q ":$port " && return 0
  return 1
}

_wait_for_port() {
  local port="$1"
  local timeout="${2:-30}"
  local interval=2
  local waited=0

  if _dev_has gum; then
    gum spin --spinner dot --title "Aguardando servidor na porta $port (até ${timeout}s)..." -- \
      bash -c "
        for i in \$(seq 1 $((timeout/interval))); do
          lsof -i :$port >/dev/null 2>&1 && exit 0
          { command -v ss >/dev/null && ss -lnt | grep -q ':$port '; } && exit 0
          { command -v netstat >/dev/null && netstat -lnt | grep -q ':$port '; } && exit 0
          sleep $interval
        done
        exit 1
      " && _dev_ok "Servidor ouvindo na porta $port." || _dev_err "Timeout: servidor não respondeu na porta $port."
  else
    echo -n "Aguardando servidor na porta $port " >&2
    while ! _check_port "$port"; do
      sleep "$interval"
      waited=$((waited + interval))
      echo -n "." >&2
      if [ $waited -ge "$timeout" ]; then
        echo >&2
        _dev_err "Timeout: servidor não respondeu após ${timeout}s."
        return 1
      fi
    done
    echo >&2
    _dev_ok "Servidor ouvindo na porta $port."
  fi
}