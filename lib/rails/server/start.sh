#!/usr/bin/env bash
# ============================================================
# Iniciar servidor Rails
# ============================================================
_server_start() {
  local project="$1"

  if ! declare -f _dev_start_server &>/dev/null; then
    _dev_err "Função _dev_start_server não encontrada. Verifique server/core.sh."
    sleep 3
    return 1
  fi

  # Avisa sobre migrações pendentes antes de subir o servidor
  if declare -f _db_has_pending_migrations &>/dev/null; then
    local pending
    if pending=$(_db_has_pending_migrations); then
      _dev_warn "Existem $pending migração(ões) pendente(s)."
      local do_migrate=""
      if _dev_has gum; then
        gum confirm "Executar db:migrate antes de iniciar?" --affirmative="Sim" --negative="Não" && do_migrate="yes"
      else
        read -r -p "Executar db:migrate antes de iniciar? (s/N) " answer
        [[ "$answer" =~ ^[Ss] ]] && do_migrate="yes"
      fi
      if [ "$do_migrate" = "yes" ]; then
        _dev_spin "Executando migrações..." _dev_run_rails db:migrate
      fi
    fi
  fi

  if ! _dev_start_server "$project" "bin/rails server" "" "rails"; then
    _dev_err "Não foi possível iniciar o servidor de '$project'."
    sleep 3
    return 1
  fi

  local final_port
  final_port=$(project-port "$project")

  if declare -f _wait_for_port &>/dev/null; then
    if _wait_for_port "$final_port" 60; then
      dev-open "$project"
    else
      _dev_warn "Servidor iniciado, mas a porta não respondeu a tempo. Verifique os logs."
    fi
  else
    sleep 3
    dev-open "$project"
  fi
  sleep 3
}