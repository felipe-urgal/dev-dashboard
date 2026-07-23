#!/usr/bin/env bash
# ============================================================
# db:snapshot — Backup rápido do banco (para trocar de branch sem
# perder o estado local e sem precisar rodar db:reset depois)
# ============================================================
_dev_db_snapshot() {
  local rails_cmd="$1"
  local project="$2"

  local adapter
  adapter=$(_dev_detect_adapter)
  local dump_bin
  case "$adapter" in
    mysql2|mysql) dump_bin="mysqldump" ;;
    postgresql)   dump_bin="pg_dump" ;;
    *)
      _dev_err "Snapshot só é suportado para MySQL/PostgreSQL (adaptador detectado: '${adapter:-desconhecido}')."
      return 1
      ;;
  esac
  if ! _dev_has "$dump_bin"; then
    _dev_err "'$dump_bin' não encontrado no PATH. Instale o cliente do banco para usar snapshots."
    return 1
  fi

  local conn
  conn=$(_db_connection_info "$rails_cmd") || {
    _dev_err "Não foi possível obter os dados de conexão do banco (rails runner falhou)."
    return 1
  }
  local host user password database
  IFS='|' read -r host user password database <<< "$conn"
  if [ -z "$database" ]; then
    _dev_err "Não foi possível determinar o nome do banco de dados."
    return 1
  fi

  local id
  id=$(_dev_project_id "$project")
  local snap_dir="$DEV_RUN_DIR/db-snapshots/$id"
  mkdir -p "$snap_dir"

  local label
  label=$(git -C "$PWD" branch --show-current 2>/dev/null)
  label=$(echo "${label:-manual}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')
  local file="$snap_dir/${label}_$(date +%Y%m%d-%H%M%S).sql.gz"
  local errfile="$snap_dir/.last_error"

  _dev_ok "Gerando snapshot de '$database' em $file ..."
  local ret
  case "$adapter" in
    mysql2|mysql)
      MYSQL_PWD="$password" mysqldump -h "$host" -u "$user" "$database" 2>"$errfile" | gzip > "$file"
      ret=${PIPESTATUS[0]}
      ;;
    postgresql)
      PGPASSWORD="$password" pg_dump -h "$host" -U "$user" "$database" 2>"$errfile" | gzip > "$file"
      ret=${PIPESTATUS[0]}
      ;;
  esac

  if [ "$ret" -ne 0 ]; then
    _dev_err "Falha ao gerar o snapshot:"
    cat "$errfile" >&2
    rm -f "$file" "$errfile"
    return 1
  fi
  rm -f "$errfile"

  _dev_ok "Snapshot criado: $(basename "$file") ($(du -h "$file" 2>/dev/null | cut -f1))"
  return 0
}
