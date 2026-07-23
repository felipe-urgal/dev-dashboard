#!/usr/bin/env bash
# ============================================================
# dev-open — Abre o navegador na URL do projeto (localhost:porta)
# ============================================================
dev-open() {
  local project="$1"

  if [ -z "$project" ]; then
    _dev_err "Nenhum projeto informado."
    sleep 3
    return 1
  fi

  local port
  port=$(project-port "$project") || port=""
  if [ -z "$port" ]; then
    _dev_err "Projeto '$project' não encontrado ou porta não definida."
    sleep 3
    return 1
  fi

  local url="http://localhost:$port"

  _dev_clear
  _dev_breadcrumb "$project" "Abrir navegador"
  echo >&2
  _dev_step "Abrindo o navegador em $url"
  echo >&2

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ open $url" >&2
  else
    echo "\$ open $url" >&2
  fi

  local ret=0
  case "$(_dev_os)" in
    linux) xdg-open "$url" >/dev/null 2>&1 ;;
    mac)   open "$url" >/dev/null 2>&1 ;;
    *)
      _dev_warn "Não sei como abrir navegador neste sistema. URL: $url"
      ret=1
      ;;
  esac

  if [ $ret -eq 0 ]; then
    _dev_ok "Navegador aberto: $url"
  fi

  sleep 3
  return $ret
}