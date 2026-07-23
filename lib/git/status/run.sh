#!/usr/bin/env bash
# ============================================================
# git-status-diff — Visualizar alterações e diffs (com cores)
# ============================================================
git-status-diff() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    _dev_pause
    return 1
  fi

  while true; do
    _dev_clear
    _dev_breadcrumb "Git" "Ver alterações"
    echo >&2
    _dev_step "Arquivos alterados no repositório:"
    echo >&2
    _status_list_files

    local all_files
    all_files=$(_status_get_files)
    if [ -z "$all_files" ]; then
      _dev_warn "Nenhuma alteração encontrada."
      _dev_pause
      return 0
    fi

    echo >&2
    local choice
    choice=$(_status_menu_show)
    [ -z "$choice" ] || [ "$choice" = "Voltar" ] && return 0

    case "$choice" in
      "Ver diff de um arquivo")
        local selected_entry
        selected_entry=$(_status_select_file "$all_files")
        [ -z "$selected_entry" ] && continue
        local st="${selected_entry%%|*}"
        local file="${selected_entry#*|}"
        if [ "$st" = "??" ]; then
          _show_new_file "$file"
        else
          local diff_cmd="git diff"
          if [[ "${st:0:1}" != " " && "${st:0:1}" != "?" ]]; then
            diff_cmd="git diff --cached"
          fi
          _show_diff "$diff_cmd" "$file"
        fi
        ;;
      "Ver diff de TODOS os arquivos")
        _show_diff "git diff"
        ;;
    esac
  done
}