#!/usr/bin/env bash
# ============================================================
# dev-health — Relatório de saúde dos servidores
# ============================================================
dev-health() {
  _dev_step "Verificando saúde dos servidores..."
  echo >&2

  local -a projects
  readarray -t projects < <(project-list)
  if [ ${#projects[@]} -eq 0 ]; then
    _dev_warn "Nenhum projeto encontrado."
    return 0
  fi

  local -a crashed_projects=()
  local project
  for project in "${projects[@]}"; do
    local port status label
    port=$(project-port "$project") || port=""
    status=$(_health_check_server "$project")
    label=$(_health_status_label "$status")

    case "$status" in
      running)      _dev_ok   "$project (porta ${port:-N/A}) → $label" ;;
      crashed)      _dev_err  "$project (porta ${port:-N/A}) → $label — veja os logs: dev-logs $project"
                    crashed_projects+=("$project") ;;
      unresponsive) _dev_warn "$project (porta ${port:-N/A}) → $label — processo vivo mas sem resposta HTTP" ;;
      stopped)      _dev_warn "$project (porta ${port:-N/A}) → $label" ;;
    esac
  done

  if [ ${#crashed_projects[@]} -gt 0 ]; then
    echo >&2
    local p
    for p in "${crashed_projects[@]}"; do
      local do_restart=""
      if _dev_has gum; then
        gum confirm "Reiniciar '$p'?" --affirmative="Sim" --negative="Não" && do_restart="yes"
      else
        read -r -p "Reiniciar '$p'? (s/N) " answer
        [[ "$answer" =~ ^[Ss] ]] && do_restart="yes"
      fi
      [ "$do_restart" = "yes" ] && dev-restart "$p"
    done
  fi
  return 0
}
