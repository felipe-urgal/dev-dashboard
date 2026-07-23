#!/usr/bin/env bash
# ============================================================
# UI HELPERS — Informações de branch (compatibilidade)
# ============================================================
# Mantido por compatibilidade com chamadas existentes.
# A lógica real agora vive em _dev_repo_label (lib/core/breadcrumb.sh).
_dev_get_branch_info() {
  local path="$1"
  if git -C "$path" rev-parse --is-inside-work-tree &>/dev/null; then
    local branch has_changes status_icon
    branch=$(git -C "$path" branch --show-current 2>/dev/null)
    has_changes=$(git -C "$path" status --porcelain 2>/dev/null)
    status_icon=""
    [ -n "$has_changes" ] && status_icon=" - alterações não comitadas!"
    echo "($branch$status_icon)"
  else
    echo "(não é repositório git)"
  fi
}