#!/usr/bin/env bash
# ============================================================
# LOOP — Loop de navegação: menu de projetos → menu de ações
# ============================================================
dev-dashboard() {
  while true; do
    _dev_clear
    _dev_print_header "Dev Dashboard"
    # echo >&2

    local chosen
    chosen=$(project-menu)
    if [ -z "$chosen" ] || [ "$chosen" = "Sair" ]; then
      break
    fi
    if [ "$chosen" = "Parar todos servidores" ]; then
      dev-stop-all
      _dev_pause
      continue
    fi
    if [ "$chosen" = "Iniciar todos servidores" ]; then
      dev-start-all
      _dev_pause
      continue
    fi

    local project="$chosen"
    local path
    path=$(project-path "$project") || path=""

    local original_dir="$PWD"
    if [ -n "$path" ] && [ -d "$path" ]; then
      cd "$path" || { _dev_err "Não foi possível acessar $path"; _dev_pause; continue; }
    else
      _dev_warn "Caminho do projeto '$project' não encontrado."
      _dev_pause
      continue
    fi

    while true; do
      _dev_clear
      _dev_breadcrumb
      local action
      action=$(dev-project-actions "$project")
      [ -z "$action" ] || [ "$action" = "Voltar" ] && break
      dev-run-command "$project" "$action"
      case "$action" in
        "Terminal"|"Git"|"Assistente IA"|"Code Review (IA)"|"QA (IA)"|"Segurança (IA)"|"Simplificar (IA)"|"Comandos Rails"|"Comandos Node")
          ;;
        *)
          _dev_pause
          ;;
      esac
    done

    cd "$original_dir" >/dev/null 2>&1
  done
}