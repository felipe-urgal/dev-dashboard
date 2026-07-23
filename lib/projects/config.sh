#!/usr/bin/env bash
# ============================================================
# PROJECTS CONFIG — Leitura de projects.conf
# ============================================================

load_project_config() {
  local conf="$HOME/.dev-dashboard/config/projects.conf"
  [ -f "$conf" ] || return 0
  while IFS=':' read -r name rest; do
    [[ -z "$name" || "$name" =~ ^# ]] && continue
    PROJECT_CONFIG["$name"]="$rest"
  done < "$conf"
}