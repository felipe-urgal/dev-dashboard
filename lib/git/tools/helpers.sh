#!/usr/bin/env bash
# ============================================================
# TOOLS HELPERS — Detecção de projeto e verificação de repositório
# ============================================================

_tools_detect_project() {
  local current_dir=$(basename "$PWD")
  if project-path "$current_dir" &>/dev/null; then
    echo "$current_dir"
  else
    return 1
  fi
}