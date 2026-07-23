#!/usr/bin/env bash
# ============================================================
# PROJECTS ACCESSORS — Funções de acesso aos metadados
# ============================================================

project-path() {
  local data="${PROJECT_META[$1]}"
  [[ -z "$data" ]] && return 1
  _project_get_field "$data" "path"
}

project-type() {
  local data="${PROJECT_META[$1]}"
  [[ -z "$data" ]] && return 1
  _project_get_field "$data" "type" "unknown"
}

project-port() {
  local data="${PROJECT_META[$1]}"
  [[ -z "$data" ]] && return 1
  _project_get_field "$data" "port"
}

project-needs-mysql() {
  local data="${PROJECT_META[$1]}"
  [[ -z "$data" ]] && echo "no" && return
  _project_get_field "$data" "mysql" "no"
}

project-has-webpack() {
  local data="${PROJECT_META[$1]}"
  [[ -z "$data" ]] && echo "no" && return
  _project_get_field "$data" "webpack" "no"
}