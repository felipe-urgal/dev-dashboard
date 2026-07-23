#!/usr/bin/env bash
# ============================================================
# db:rollback
# ============================================================
# Depende de:
#   core.sh      (_dev_has, _dev_ok, _dev_err, _dev_warn, _dev_pause, _dev_spin)
#   projects.sh  (project-databases)
# ============================================================
_dev_db_rollback() {
  local rails_cmd="$1"
  local project="$2"

  local steps
  if _dev_has gum; then
    steps=$(gum input --header "Número de steps (padrão=1):" --placeholder "1")
  else
    read -r -p "Número de steps a reverter (padrão=1): " steps
  fi
  steps=${steps:-1}

  local -a databases
  readarray -t databases < <(project-databases "$project")

  if [ ${#databases[@]} -gt 1 ]; then
    local chosen=""
    if _dev_has gum; then
      chosen=$(printf '%s\n' "${databases[@]}" | gum choose --header "Escolha o banco para reverter:")
    else
      echo "Bancos disponíveis:" >&2
      local i=1
      for db in "${databases[@]}"; do
        echo "  $i) $db" >&2
        ((i++))
      done
      read -r -p "Número: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#databases[@]} ]; then
        chosen="${databases[$((choice-1))]}"
      fi
    fi
    if [ -n "$chosen" ]; then
      _dev_spin "Revertendo $steps step(s) em '$chosen'..." $rails_cmd "db:rollback:${chosen}" STEP="$steps"
    else
      _dev_warn "Nenhum banco selecionado. Rollback cancelado."
      return 1
    fi
  else
    _dev_spin "Revertendo $steps step(s)..." $rails_cmd db:rollback STEP="$steps"
  fi
}