#!/usr/bin/env bash
# ============================================================
# PROJECTS DETECT — Descoberta de projetos no DEV_BASE
# ============================================================

# Detecta o tipo de um projeto a partir do seu diretório.
# Retorna via stdout: "rails" ou "node" ou "unknown"
_project_detect_type() {
  local dir="$1"
  if [ -f "$dir/Gemfile" ] && _project_gemfile_is_rails "$dir/Gemfile"; then
    echo "rails"
  elif [ -f "$dir/package.json" ]; then
    echo "node"
  else
    echo "unknown"
  fi
}

# Regra de detecção do Rails compartilhada com packages/project-discovery via
# shared/project-type-rules.json (ver docs/architecture/overview.md, seção
# "Regras compartilhadas entre CLI e web"). Usa jq quando disponível para ler
# o padrão POSIX ERE do arquivo compartilhado; sem jq (ou sem o arquivo), cai
# no mesmo padrão embutido como fallback — dev-doctor avisa (não bloqueia)
# quando jq está ausente.
_project_gemfile_is_rails() {
  local gemfile="$1"
  local pattern='^[[:space:]]*gem[[:space:]]+["'"'"']rails["'"'"']'
  local rules_file="$DEV_DASHBOARD_DIR/shared/project-type-rules.json"

  if [ -f "$rules_file" ] && declare -f _dev_has &>/dev/null && _dev_has jq; then
    local shared_pattern
    shared_pattern=$(jq -r '.rails.gemNamePatternPosix // empty' "$rules_file" 2>/dev/null)
    [ -n "$shared_pattern" ] && pattern="$shared_pattern"
  fi

  grep -Eq "$pattern" "$gemfile" 2>/dev/null
}

# Ponto de entrada público. Usa o cache de lib/projects/cache.sh quando a
# assinatura (mtimes de DEV_BASE, do arquivo de overrides e de cada projeto)
# não mudou desde a última varredura — evita reabrir Gemfile/package.json/
# database.yml de cada projeto a cada shell novo em workspaces grandes.
# `detect_projects --force` ignora o cache e varre de novo.
detect_projects() {
  local force="${1:-}"
  local base="${DEV_BASE:-$HOME/Caiena/Projetos}"

  if [ "$force" != "--force" ] && declare -f _detect_cache_signature &>/dev/null; then
    local signature
    signature="$(_detect_cache_signature)" && _detect_cache_read "$signature" && return 0
  fi

  _detect_projects_scan
  local status=$?

  if [ $status -eq 0 ] && [ -d "$base" ] && declare -f _detect_cache_write &>/dev/null; then
    local signature
    signature="$(_detect_cache_signature 2>/dev/null)" && _detect_cache_write "$signature"
  fi

  return $status
}

_detect_projects_scan() {
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
    local cfg="${PROJECT_CONFIG[$project]:-}"
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

    local port="${PROJECT_CONFIG[$project]:-}"
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