#!/usr/bin/env bash
# ============================================================
# PROJECTS LIST — Lista de nomes de projetos ordenados
# ============================================================
project-list() {
  if [ ${#PROJECT_META[@]} -eq 0 ]; then
    return 0
  fi

  local -a names=()
  local key
  for key in "${!PROJECT_META[@]}"; do
    names+=("$key")
  done

  local -a sorted
  readarray -t sorted < <(printf '%s\n' "${names[@]}" | sort)
  printf '%s\n' "${sorted[@]}"
}