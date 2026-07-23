#!/usr/bin/env bash
# ============================================================
# git-log — Visualizar histórico de commits
# ============================================================
git-log() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    _dev_pause
    return 1
  fi

  local recent_count=20
  while true; do
    _dev_clear
    _dev_breadcrumb "Git" "Ver commits"
    echo >&2
    _dev_step "Histórico de commits (últimos $recent_count):"
    echo >&2
    _log_show_recent "$recent_count"

    local choice
    choice=$(_log_menu_show)
    [ -z "$choice" ] || [ "$choice" = "Voltar" ] && return 0

    case "$choice" in
      "Ver detalhes de um commit")
        local all_commits
        all_commits=$(_log_get_commits "$recent_count")
        local selected_hash
        selected_hash=$(_log_select_commit "$all_commits")
        if [ -n "$selected_hash" ]; then
          _show_commit_detail "$selected_hash"
        fi
        ;;
      "Ver mais commits")
        recent_count=$((recent_count + 20))
        ;;
    esac
  done
}