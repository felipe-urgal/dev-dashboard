#!/usr/bin/env bash
# ============================================================
# dev-node-menu-testes — Submenu Testes Node
# ============================================================
dev-node-menu-testes() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  local pkg_manager
  pkg_manager=$(_node_pkg_manager) || {
    _dev_err "Nenhum gerenciador de pacotes (pnpm/yarn/npm) encontrado."
    _dev_pause
    return 1
  }

  local info
  info=$(_node_tests_detect_scripts)
  local has_test="${info%%|*}"
  local has_coverage="${info##*|}"

  local runner
  runner=$(_node_tests_detect_runner)

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Node" "Testes"
    echo >&2
    if [ -n "$runner" ]; then
      _dev_step "Execute os testes ($runner via $pkg_manager): todos, com cobertura ou um arquivo específico."
    else
      _dev_step "Execute os testes: todos, com cobertura ou um arquivo específico."
    fi
    echo >&2

    local action
    action=$(_node_tests_menu_show "$has_test" "$has_coverage" "$pkg_manager")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Test")
        _node_tests_run_live $pkg_manager test
        ;;
      "Coverage")
        _node_tests_run_live $pkg_manager run test:coverage
        _dev_pause
        ;;
      "Arquivo")
        local selected_file
        selected_file=$(_node_tests_select_file)
        if [ -z "$selected_file" ]; then
          _dev_warn "Nenhum arquivo selecionado."
          _dev_pause
          continue
        fi

        while true; do
          _node_tests_run_live $pkg_manager test "$selected_file"
          _dev_clear
          _dev_breadcrumb "Comandos Node" "Testes" "Arquivo"
          echo >&2
          _dev_step "Último arquivo executado: $selected_file"
          echo >&2

          local repeat=false
          if _dev_has gum; then
            gum confirm "Executar novamente o mesmo arquivo?" --affirmative="Sim" --negative="Não" && repeat=true
          else
            read -r -p "Executar novamente? (s/N) " answer
            [[ "$answer" =~ ^[Ss] ]] && repeat=true
          fi

          if $repeat; then
            continue
          else
            break
          fi
        done
        ;;
    esac
  done
}