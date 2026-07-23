#!/usr/bin/env bash
# ============================================================
# git-undo — Desfaz alterações em arquivos selecionados
# ============================================================

git-undo() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 3
    return 1
  fi

  local all_files
  all_files=$(_undo_get_files)
  if [ -z "$all_files" ]; then
    _dev_ok "Nenhum arquivo modificado para desfazer."
    sleep 3
    return 0
  fi

  local -a selected_entries
  readarray -t selected_entries < <(_undo_select_files "$all_files")
  if [ ${#selected_entries[@]} -eq 0 ]; then
    _dev_warn "Nenhum arquivo selecionado."
    sleep 3
    return 0
  fi

  if ! _undo_confirm_restore "${selected_entries[@]}"; then
    _dev_warn "Operação cancelada."
    sleep 3
    return 0
  fi

  _undo_restore_files "${selected_entries[@]}"
  sleep 3
}