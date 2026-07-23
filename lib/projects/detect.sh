#!/usr/bin/env bash
# ============================================================
# PROJECTS DETECT — Descoberta de projetos no DEV_BASE
# ============================================================

# Detecta o tipo de um projeto a partir do seu diretório.
# Retorna via stdout: "rails" ou "node" ou "unknown"
_project_detect_type() {
  local dir="$1"
  if [ -f "$dir/Gemfile" ] && grep -q "rails" "$dir/Gemfile" 2>/dev/null; then
    echo "rails"
  elif [ -f "$dir/package.json" ]; then
    echo "node"
  else
    echo "unknown"
  fi
}

detect_projects() {
  PROJECT_META=()
  local base="${DEV_BASE:-$HOME/Caiena/Projetos}"

  if [ ! -d "$base" ]; then
    _dev_warn "DEV_BASE aponta para um diretório inexistente: $base"
    return 1
  fi

  local -a used_ports=()
  local -a projects_found=()
  local name dir type project

  shopt -s nullglob
  for dir in "$base"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    [[ "$name" == .* ]] && continue

    type=$(_project_detect_type "$dir")
    [ "$type" = "unknown" ] && continue

    projects_found+=("$name")
  done
  shopt -u nullglob

  if [ ${#projects_found[@]} -eq 0 ]; then
    _dev_warn "Nenhum projeto Rails ou Node encontrado em $base."
    return 0
  fi

  for project in "${projects_found[@]}"; do
    local cfg="${PROJECT_CONFIG[$project]}"
    if [[ -n "$cfg" && "$cfg" =~ ^[0-9]+$ ]]; then
      used_ports+=("$cfg")
    fi
  done

  local next_port=3000
  for project in "${projects_found[@]}"; do
    local path="$base/$project"
    local webpack="no"
    local mysql="no"

    type=$(_project_detect_type "$path")
    if [ "$type" = "rails" ]; then
      [ -d "$path/config/webpack" ] && webpack="yes"
      if [ -f "$path/config/database.yml" ] && grep -q "mysql2" "$path/config/database.yml" 2>/dev/null; then
        mysql="yes"
      fi
    fi

    local port="${PROJECT_CONFIG[$project]}"
    if [[ ! "$port" =~ ^[0-9]+$ ]]; then
      port=""
      while : ; do
        local in_use=false
        local used
        for used in "${used_ports[@]}"; do
          [ "$used" -eq "$next_port" ] && in_use=true && break
        done
        if ! $in_use; then
          port="$next_port"
          used_ports+=("$next_port")
          ((next_port++))
          break
        fi
        ((next_port++))
      done
    else
      used_ports+=("$port")
    fi

    PROJECT_META["$project"]="path:$path|type:$type|port:$port|mysql:$mysql|webpack:$webpack"
  done
}