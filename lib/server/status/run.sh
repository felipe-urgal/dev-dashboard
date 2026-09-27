#!/usr/bin/env bash
# ============================================================
# SERVER/STATUS — Relatórios usando Process Manager quando disponível
# ============================================================

dev-servers() {
  if _dev_dashboard_api_available; then
    local snapshot
    snapshot=$(_dev_dashboard_snapshot) || return 1
    local found=0
    while IFS=$'\t' read -r project_id project_name project_path project_type enabled port runtime_status environment_instance_id pid; do
      case "$runtime_status" in
        running|starting|stopping|failed)
          local symbol
          symbol=$(_dev_runtime_status_symbol "$runtime_status")
          _dev_step "$symbol $project_name: $runtime_status${port:+ (porta $port)}${pid:+ PID $pid}"
          found=1
          ;;
      esac
    done <<< "$snapshot"
    [ "$found" -eq 0 ] && _dev_warn "Nenhum servidor managed em execução."
    return 0
  fi

  _dev_warn "API local indisponível; status de ownership é unknown."
  return 0
}

dev-status() {
  dev-status-all
}

dev-status-all() {
  if _dev_dashboard_api_available; then
    local snapshot
    snapshot=$(_dev_dashboard_snapshot) || return 1
    while IFS=$'\t' read -r project_id project_name project_path project_type enabled port runtime_status environment_instance_id pid; do
      local symbol
      symbol=$(_dev_runtime_status_symbol "$runtime_status")
      _dev_step "$symbol $project_name → $runtime_status${port:+ (porta $port)}${environment_instance_id:+ [env $environment_instance_id]}"
    done <<< "$snapshot"
    return 0
  fi

  local -a projects
  readarray -t projects < <(project-list)
  local project
  for project in "${projects[@]}"; do
    local port
    port=$(project-port "$project") || port=""
    _dev_warn "$project → unknown${port:+ (porta configurada $port)}"
  done
}
