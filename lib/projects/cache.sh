#!/usr/bin/env bash
# ============================================================
# PROJECTS CACHE — Cache da detecção inicial para workspaces grandes
# ============================================================
# detect_projects() varre DEV_BASE e lê Gemfile/package.json/database.yml de
# cada projeto a cada shell novo. A assinatura abaixo usa só metadados
# (mtime de diretórios), sem reabrir esses arquivos, para decidir se o
# resultado cacheado ainda é válido — se for, pula a varredura pesada.

_detect_cache_file() {
  echo "$DEV_RUN_DIR/projects-detect-cache"
}

_detect_mtime() {
  stat -c '%Y' "$1" 2>/dev/null || stat -f '%m' "$1" 2>/dev/null
}

# Assinatura determinística de tudo que pode mudar o resultado da detecção:
# o próprio DEV_BASE, o arquivo de overrides de porta, e cada diretório de
# projeto de primeiro nível (mais o seu "config/", onde vivem
# database.yml/webpack para Rails). mtime de diretório muda quando um filho
# direto é criado/removido/renomeado, então isso cobre Gemfile/package.json
# aparecendo ou sumindo sem precisar reabrir cada arquivo.
_detect_cache_signature() {
  local base="${DEV_BASE:-$HOME/Caiena/Projetos}"
  [ -d "$base" ] || return 1

  local conf="$HOME/.dev-dashboard/config/projects.conf"
  local -a parts=()
  parts+=("base:$(_detect_mtime "$base")")
  if [ -f "$conf" ]; then
    parts+=("conf:$(_detect_mtime "$conf")")
  else
    parts+=("conf:none")
  fi

  local -a names=()
  local dir name
  shopt -s nullglob
  for dir in "$base"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    [[ "$name" == .* ]] && continue
    names+=("$name")
  done
  shopt -u nullglob

  local sorted
  sorted=$(printf '%s\n' "${names[@]}" | sort)
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    dir="$base/$name"
    parts+=("$name:$(_detect_mtime "$dir")")
    if [ -d "$dir/config" ]; then
      parts+=("$name/config:$(_detect_mtime "$dir/config")")
    fi
  done <<< "$sorted"

  printf '%s\n' "${parts[*]}"
}

_detect_cache_write() {
  local signature="$1"
  local cache_file
  cache_file="$(_detect_cache_file)"

  {
    printf 'SIG\t%s\n' "$signature"
    local project
    for project in "${!PROJECT_META[@]}"; do
      printf '%s\t%s\n' "$project" "${PROJECT_META[$project]}"
    done
  } > "$cache_file" 2>/dev/null
}

# Preenche PROJECT_META a partir do cache se a assinatura bater.
# Retorna 0 (cache usado) ou 1 (precisa varrer de novo).
_detect_cache_read() {
  local signature="$1"
  local cache_file
  cache_file="$(_detect_cache_file)"
  [ -f "$cache_file" ] || return 1

  local line first=true valid=false
  local -A loaded=()
  while IFS= read -r line || [ -n "$line" ]; do
    if $first; then
      first=false
      [ "$line" = "$(printf 'SIG\t%s' "$signature")" ] || return 1
      valid=true
      continue
    fi
    [ -z "$line" ] && continue
    local name="${line%%$'\t'*}"
    local meta="${line#*$'\t'}"
    loaded["$name"]="$meta"
  done < "$cache_file"

  $valid || return 1
  PROJECT_META=()
  local key
  for key in "${!loaded[@]}"; do
    PROJECT_META["$key"]="${loaded[$key]}"
  done
  return 0
}
