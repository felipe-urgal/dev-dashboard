#!/usr/bin/env bash
# ============================================================
# UI HEADER — Cabeçalho do projeto
# ============================================================
_dev_show_project_header() {
  local project="$1"
  local path="$2"
  local status_text="$3"

  if [ -z "$path" ]; then
    path=$(project-path "$project") || path=""
  fi
  if [ -z "$status_text" ]; then
    local port
    port=$(project-port "$project") || port=""
    if [ -n "$port" ] && _is_port_in_use "$port"; then
      status_text="🟢 (porta $port)"
    else
      status_text="🔴"
    fi
  fi

  _dev_breadcrumb "$path" "$status_text $project"
}