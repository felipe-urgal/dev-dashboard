#!/usr/bin/env bash
# ============================================================
# PROJECTS HELPERS — Extração de campos dos metadados
# ============================================================

_project_get_field() {
  local data="$1" field="$2"
  local default="${3:-}"
  local IFS='|'
  for pair in $data; do
    case "$pair" in
      ${field}:*)
        printf '%s\n' "${pair#${field}:}"
        return 0
        ;;
    esac
  done
  printf '%s\n' "$default"
  return 1
}