#!/usr/bin/env bash
# ============================================================
# PROJECTS DATABASES — Lista bancos configurados no database.yml
# ============================================================
project-databases() {
  local project="$1"
  local path
  path=$(project-path "$project")
  [ -z "$path" ] && return 1

  local env="${RAILS_ENV:-development}"
  local db_file="$path/config/database.yml"
  [ -f "$db_file" ] || return 1

  local -a databases=()
  local inside_env=false
  while IFS= read -r line; do
    if [[ "$line" == "${env}:"* ]]; then
      inside_env=true
      continue
    fi
    if $inside_env; then
      if [[ "$line" =~ ^[a-zA-Z] ]]; then
        break
      fi
      if [[ "$line" =~ ^[[:space:]]{2,4}([a-zA-Z_][a-zA-Z0-9_]*): ]]; then
        databases+=("${BASH_REMATCH[1]}")
      fi
    fi
  done < "$db_file"

  if [ ${#databases[@]} -gt 0 ]; then
    printf '%s\n' "${databases[@]}"
  else
    return 1
  fi
}