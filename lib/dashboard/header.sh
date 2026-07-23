#!/usr/bin/env bash
# ============================================================
# HEADER — Cabeçalho com fallback (gum ou texto)
# ============================================================
_dev_print_header() {
  local text="$1"
  if _dev_has gum; then
    local cols
    cols=$(tput cols 2>/dev/null || echo 80)
    local width=$((cols - 2))
    gum style --border rounded --border-foreground "#7C3AED" \
      --padding "0 2" --width "$width" --align center "$text" >&2
  else
    echo "========== $text ==========" >&2
  fi
}