#!/usr/bin/env bash
# ============================================================
# RUNTIME API — Helpers compartilhados pelos menus Rails/Node
# ============================================================

_runtime_api() {
  node "$DEV_DASHBOARD_DIR/scripts/terminal-runtime-api.mjs" "$@"
}

_runtime_confirm() {
  local prompt="$1"
  if _dev_has gum; then
    gum confirm "$prompt" --default=false --affirmative="Sim" --negative="Não"
  else
    read -r -p "$prompt (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]]
  fi
}

_runtime_choose() {
  local prompt="$1"
  shift
  local -a options=("$@")
  [ ${#options[@]} -eq 0 ] && return 1

  if _dev_has gum; then
    printf '%s\n' "${options[@]}" | gum choose --header "$prompt"
  else
    echo "$prompt" >&2
    local i=1 option
    for option in "${options[@]}"; do
      echo "  $i) $option" >&2
      ((i++))
    done
    read -r -p "Escolha: " choice
    [[ "$choice" =~ ^[0-9]+$ ]] || return 1
    (( choice >= 1 && choice <= ${#options[@]} )) || return 1
    printf '%s' "${options[$((choice-1))]}"
  fi
}

_runtime_terminal_supported() {
  [ "$(_runtime_api terminal-supported "$1" "$2" 2>/dev/null)" = "yes" ]
}

_runtime_server_menu() {
  local project="$1"
  local action
  action=$(_runtime_choose "Servidor" "Status" "Iniciar" "Parar" "Reiniciar" "Voltar") || return 0

  case "$action" in
    "Status")
      _dev_dashboard_snapshot | awk -F '\t' -v project="$project" '$2==project {print $2 ": " $7 " porta=" $6}'
      _dev_pause
      ;;
    "Iniciar")
      _dev_dashboard_start "$project"
      _dev_pause
      ;;
    "Parar")
      _dev_dashboard_stop "$project"
      _dev_pause
      ;;
    "Reiniciar")
      dev-restart "$project"
      _dev_pause
      ;;
  esac
}

_runtime_tests_menu() {
  local project="$1"
  local action
  action=$(_runtime_choose "Testes" "Executar" "Status" "Ver log" "Parar" "Voltar") || return 0

  case "$action" in
    "Executar")
      local -a commands=()
      readarray -t commands < <(_runtime_api tests-list "$project")
      local selected
      selected=$(_runtime_choose "Comando de teste" "${commands[@]}") || return 0
      local command_id
      command_id=$(printf '%s' "$selected" | cut -f1)
      _runtime_api tests-start "$project" "$command_id"
      _dev_pause
      ;;
    "Status")
      _runtime_api tests-status "$project"
      _dev_pause
      ;;
    "Ver log")
      _runtime_api tests-log "$project"
      echo >&2
      _dev_pause
      ;;
    "Parar")
      if _runtime_confirm "Parar a execução de testes owned deste ambiente?"; then
        _runtime_api tests-stop "$project"
        _dev_pause
      fi
      ;;
  esac
}

_runtime_dependencies_menu() {
  local project="$1"
  local action
  action=$(_runtime_choose "Dependências / Build" "Executar ação" "Status" "Cancelar" "Voltar") || return 0

  case "$action" in
    "Executar ação")
      local -a actions=()
      readarray -t actions < <(_runtime_api deps-list "$project")
      local selected
      selected=$(_runtime_choose "Ação disponível" "${actions[@]}") || return 0
      local action_id
      action_id=$(printf '%s' "$selected" | cut -f1)
      if _runtime_confirm "Executar a ação selecionada no runtime atual?"; then
        _runtime_api deps-start "$project" "$action_id"
        _dev_pause
      fi
      ;;
    "Status")
      _runtime_api deps-status "$project"
      _dev_pause
      ;;
    "Cancelar")
      if _runtime_confirm "Cancelar a execução de dependências/build deste ambiente?"; then
        _runtime_api deps-cancel "$project"
        _dev_pause
      fi
      ;;
  esac
}

_runtime_migrations_menu() {
  local project="$1"
  local action
  action=$(_runtime_choose "Migrations" "Inspecionar" "Aplicar pendentes" "Status da execução" "Cancelar execução" "Voltar") || return 0

  case "$action" in
    "Inspecionar")
      _runtime_api migrations-overview "$project"
      _dev_pause
      ;;
    "Aplicar pendentes")
      if _runtime_confirm "Aplicar migrations após preflight e revalidação do plano?"; then
        _runtime_api migrations-apply "$project"
        _dev_pause
      fi
      ;;
    "Status da execução")
      _runtime_api migrations-status "$project"
      _dev_pause
      ;;
    "Cancelar execução")
      if _runtime_confirm "Cancelar a execução de migrations deste ambiente?"; then
        _runtime_api migrations-cancel "$project"
        _dev_pause
      fi
      ;;
  esac
}

_runtime_worker_detected() {
  _runtime_api worker-status "$1" "$2" 2>/dev/null | grep -q 'detected=true'
}

_runtime_worker_menu() {
  local project="$1"
  local worker="$2"
  local label="$3"
  local action
  action=$(_runtime_choose "$label" "Status" "Iniciar" "Parar" "Reiniciar" "Voltar") || return 0

  case "$action" in
    "Status")
      _runtime_api worker-status "$project" "$worker"
      _dev_pause
      ;;
    "Iniciar")
      _runtime_api worker-start "$project" "$worker"
      _dev_pause
      ;;
    "Parar")
      if _runtime_confirm "Parar $label neste ambiente?"; then
        _runtime_api worker-stop "$project" "$worker"
        _dev_pause
      fi
      ;;
    "Reiniciar")
      if _runtime_confirm "Reiniciar $label neste ambiente?"; then
        _runtime_api worker-restart "$project" "$worker"
        _dev_pause
      fi
      ;;
  esac
}
