#!/usr/bin/env bash
# ============================================================
# Selecionar e executar arquivos específicos
# ============================================================

_tests_run_selected() {
  local files=$(_select_multiple_specs)
  if [ -z "$files" ]; then
    _dev_warn "Nenhum arquivo selecionado."
    sleep 3
    return 1
  fi
  _run_rspec_live "$files"
}