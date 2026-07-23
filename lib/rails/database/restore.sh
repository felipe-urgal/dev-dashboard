#!/usr/bin/env bash
# ============================================================
# db:restore — Restaura um snapshot criado por db:snapshot
# ============================================================
_dev_db_restore() {
  local rails_cmd="$1"
  local project="$2"

  local id
  id=$(_dev_project_id "$project")
  local snap_dir="$DEV_RUN_DIR/db-snapshots/$id"

  local -a files=()
  if [ -d "$snap_dir" ]; then
    while IFS= read -r f; do files+=("$f"); done < <(find "$snap_dir" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)
  fi

  if [ ${#files[@]} -eq 0 ]; then
    _dev_warn "Nenhum snapshot encontrado para este projeto. Use 'db:snapshot' primeiro."
    return 1
  fi

  local -a labels=()
  local f
  for f in "${files[@]}"; do
    labels+=("$(basename "$f")")
  done

  local chosen=""
  if _dev_has gum; then
    chosen=$(printf '%s\n' "${labels[@]}" | gum choose --header "Selecione o snapshot para restaurar:")
  else
    echo "Snapshots disponíveis (mais recente primeiro):" >&2
    local i
    for i in "${!labels[@]}"; do
      echo "  $((i+1))) ${labels[$i]}" >&2
    done
    read -r -p "Número: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#labels[@]} ]; then
      chosen="${labels[$((choice-1))]}"
    fi
  fi
  [ -z "$chosen" ] && return 1

  local file="$snap_dir/$chosen"
  [ -f "$file" ] || { _dev_err "Arquivo de snapshot não encontrado."; return 1; }

  local confirmed=false
  if _dev_has gum; then
    gum confirm "Restaurar '$chosen'? Isso SOBRESCREVE o banco atual." --default=false --affirmative="Sim" --negative="Não" && confirmed=true
  else
    read -r -p "Restaurar '$chosen'? Isso SOBRESCREVE o banco atual. (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && confirmed=true
  fi
  $confirmed || { _dev_warn "Cancelado."; return 1; }

  local adapter
  adapter=$(_dev_detect_adapter)
  local conn
  conn=$(_db_connection_info "$rails_cmd") || {
    _dev_err "Não foi possível obter os dados de conexão do banco (rails runner falhou)."
    return 1
  }
  local host user password database
  IFS='|' read -r host user password database <<< "$conn"

  _dev_ok "Restaurando '$chosen' em '$database' ..."
  local ret
  case "$adapter" in
    mysql2|mysql)
      gunzip -c "$file" | MYSQL_PWD="$password" mysql -h "$host" -u "$user" "$database"
      ret=$?
      ;;
    postgresql)
      gunzip -c "$file" | PGPASSWORD="$password" psql -h "$host" -U "$user" "$database" -q
      ret=$?
      ;;
    *)
      _dev_err "Adaptador de banco desconhecido: $adapter"
      return 1
      ;;
  esac

  if [ $ret -eq 0 ]; then
    _dev_ok "Banco restaurado a partir de '$chosen'."
  else
    _dev_err "Falha ao restaurar o snapshot (código $ret)."
  fi
  return $ret
}
