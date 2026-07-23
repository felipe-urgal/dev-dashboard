#!/usr/bin/env bash
# ============================================================
# SERVER/LOGS — Visualização segura de logs (com cores)
# ============================================================
# Depende de:
#   server/core (_dev_project_id)
#   projects    (project-list, project-path)
# ============================================================
dev-logs() {
  local project=""
  local follow=true
  local lines=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -n|--lines) lines="$2"; follow=false; shift 2 ;;
      -f|--follow) follow=true; shift ;;
      -*)
        _dev_err "Opção desconhecida: $1"
        echo "Uso: dev-logs [-n linhas] [-f] [projeto]" >&2
        return 1
        ;;
      *) project="$1"; shift ;;
    esac
  done

  if [[ -z "$project" ]]; then
    local -a projects_with_logs=()
    local -a projects
    readarray -t projects < <(project-list)
    for p in "${projects[@]}"; do
      local id
      id=$(_dev_project_id "$p")
      [[ -f "$DEV_RUN_DIR/${id}.log" ]] && projects_with_logs+=("$p")
    done

    if [[ ${#projects_with_logs[@]} -eq 0 ]]; then
      _dev_err "Nenhum arquivo de log encontrado em $DEV_RUN_DIR."
      return 1
    fi

    _dev_clear
    _dev_breadcrumb "Logs"
    echo >&2
    _dev_step "Escolha o projeto para visualizar os logs."
    echo >&2

    if _dev_has gum; then
      project=$(gum choose "${projects_with_logs[@]}")
    else
      echo "Projetos com logs disponíveis:" >&2
      local i=1
      for p in "${projects_with_logs[@]}"; do
        echo "  $i) $p" >&2
        ((i++))
      done
      read -r -p "Escolha o número do projeto: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#projects_with_logs[@]} )); then
        project="${projects_with_logs[$((choice-1))]}"
      else
        _dev_err "Escolha inválida."
        return 1
      fi
    fi

    [[ -z "$project" ]] && { _dev_warn "Operação cancelada."; return 0; }
  fi

  local id
  id=$(_dev_project_id "$project")
  local log_file="$DEV_RUN_DIR/${id}.log"

  if [[ ! -f "$log_file" ]]; then
    _dev_err "Log não encontrado para '$project' ($log_file)."
    echo "Dica: inicie o servidor primeiro com o dashboard." >&2
    return 1
  fi

  if [[ ! -s "$log_file" ]]; then
    _dev_warn "Arquivo de log está vazio."
    return 0
  fi

  local pid_file="$DEV_RUN_DIR/${id}.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
      _dev_warn "Servidor não está em execução (PID $pid está morto). Mostrando log existente."
    fi
  else
    _dev_warn "Nenhum PID registrado para '$project'. Mostrando log existente."
  fi

  _dev_clear
  _dev_breadcrumb "Logs" "$project"
  echo >&2
  _dev_ok "Exibindo log de '$project' (Ctrl+C para sair)..."
  echo >&2

  trap ':' INT
  if $follow; then
    if _dev_has bat; then
      tail -f "$log_file" | bat --paging=never -l log
    elif _dev_has lnav; then
      lnav -f "$log_file"
    elif command -v less &>/dev/null; then
      less -R +F "$log_file"
    else
      tail -f "$log_file" | sed \
        -e 's/\(ERROR\|FATAL\|CRITICAL\)/\x1b[31m\1\x1b[0m/gi' \
        -e 's/\(WARN\|WARNING\)/\x1b[33m\1\x1b[0m/gi' \
        -e 's/\(INFO\)/\x1b[32m\1\x1b[0m/gi' \
        -e 's/\(DEBUG\|TRACE\)/\x1b[36m\1\x1b[0m/gi'
    fi
  else
    if [[ "$lines" -gt 0 ]]; then
      if _dev_has bat; then
        bat --paging=never -l log -n "$lines" "$log_file"
      else
        tail -n "$lines" "$log_file"
      fi
    else
      if _dev_has bat; then
        bat --paging=never -l log "$log_file"
      elif command -v less &>/dev/null; then
        less -R "$log_file"
      else
        cat "$log_file"
      fi
    fi
  fi
  trap - INT

  _dev_clear
  return 0
}