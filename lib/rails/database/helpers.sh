#!/usr/bin/env bash
# ============================================================
# DATABASE HELPERS — Funções auxiliares
# ============================================================
_dev_detect_adapter() {
  local db_file="config/database.yml"
  [ -f "$db_file" ] || return 1
  grep -E '^\s*adapter:\s*' "$db_file" | head -n1 | sed 's/.*adapter:\s*//;s/[[:space:]]*$//'
}

_dev_database_port() {
  local adapter
  adapter=$(_dev_detect_adapter)
  case "$adapter" in
    mysql2|mysql) echo 3306 ;;
    postgresql)   echo 5432 ;;
    *)            echo "" ;;
  esac
}

# Retorna 0 se há migrações pendentes (e imprime a contagem), 1 caso contrário.
_db_has_pending_migrations() {
  local pending
  pending=$(_dev_run_rails db:migrate:status 2>/dev/null | grep -c "^[[:space:]]*down")
  if [ "$pending" -gt 0 ] 2>/dev/null; then
    echo "$pending"
    return 0
  fi
  return 1
}

# Retorna "host|user|password|database" da conexão ativa do Rails (env atual),
# via `rails runner`. Usado por db:snapshot e db:restore para montar o
# mysqldump/pg_dump/psql sem precisar parsear database.yml manualmente.
_db_connection_info() {
  local rails_cmd="$1"
  local out
  out=$($rails_cmd runner 'c = ActiveRecord::Base.connection_db_config.configuration_hash; puts [(c[:host] || "127.0.0.1"), (c[:username] || c[:user] || "root"), (c[:password] || ""), c[:database]].join("|")' 2>/dev/null)
  [ -z "$out" ] && return 1
  echo "$out"
}

_dev_database_running() {
  local port
  port=$(_dev_database_port)
  [ -z "$port" ] && return 1
  if command -v lsof &>/dev/null; then
    lsof -i :"$port" >/dev/null 2>&1 && return 0
  fi
  if command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":$port " && return 0
  fi
  if command -v netstat &>/dev/null; then
    netstat -tlnp 2>/dev/null | grep -q ":$port " && return 0
  fi
  local adapter
  adapter=$(_dev_detect_adapter)
  case "$adapter" in
    mysql2|mysql) pgrep -x mysqld >/dev/null 2>&1 && return 0 ;;
    postgresql)   pgrep -x postgres >/dev/null 2>&1 && return 0 ;;
  esac
  return 1
}