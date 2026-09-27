#!/usr/bin/env bash
# ============================================================
# ROUTER — Roteador de ações escolhidas no menu
# ============================================================
dev-run-command() {
  local project="$1"
  local action="$2"
  local path
  path=$(project-path "$project") || path=""
  local old_dir
  old_dir=$(pwd)

  case "$action" in
    "Git")
      if [ -z "$path" ]; then
        _dev_err "Caminho do projeto '$project' não encontrado."
        _dev_pause
      else
        _dev_cd "$path" || { _dev_pause; }
        git-tools "$project"
      fi
      ;;
    "Abrir no navegador")
      dev-open "$project"
      ;;
    "Abrir no editor")
      dev-editor "$project"
      ;;
    "Terminal")
      dev-terminal "$project"
      ;;
    "Status dos servidores")
      dev-servers
      _dev_pause
      ;;
    "Comandos Rails")
      dev-rails-menu "$project"
      ;;
    "Comandos Node")
      dev-node-menu "$project"
      ;;
    *)
      _dev_warn "Ação desconhecida: $action"
      _dev_pause
      ;;
  esac

  cd "$old_dir" >/dev/null 2>&1
}