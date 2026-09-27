#!/usr/bin/env bash
# ============================================================
# ROUTER — Roteador de ações escolhidas no menu
# ============================================================
dev-run-command() {
  local project="$1"
  local action="$2"
  local path=""
  if _dev_dashboard_api_available; then
    local project_record=""
    project_record=$(_dev_dashboard_project_record "$project" 2>/dev/null) || project_record=""
    if [ -n "$project_record" ]; then
      IFS=
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
}\t' read -r _project_id _project_name path _project_type _enabled _port _status _environment_instance_id _pid <<< "$project_record"
    fi
  fi
  [ -n "$path" ] || path=$(project-path "$project") || path=""

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