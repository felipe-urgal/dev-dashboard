#!/usr/bin/env bash
# ============================================================
# dev-node-menu-tools — Lint, build e typecheck do projeto Node
# ============================================================
dev-node-menu-tools() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Node" "Ferramentas"
    echo >&2

    local lint_script build_script typecheck_script
    lint_script=$(_node_tools_find_script lint eslint) || lint_script=""
    build_script=$(_node_tools_find_script build) || build_script=""
    typecheck_script=$(_node_tools_find_script typecheck type-check tsc) || typecheck_script=""

    if [ -z "$lint_script" ] && [ -z "$build_script" ] && [ -z "$typecheck_script" ]; then
      _dev_warn "Nenhum script de lint, build ou typecheck encontrado no package.json."
      _dev_pause
      return 0
    fi

    _dev_step "Ferramentas disponíveis no projeto."
    echo >&2

    local action
    action=$(_node_tools_menu_show "$lint_script" "$build_script" "$typecheck_script")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Lint")      _node_tools_run "$lint_script" ;;
      "Build")     _node_tools_run "$build_script" ;;
      "Typecheck") _node_tools_run "$typecheck_script" ;;
    esac
    _dev_pause
  done
}
