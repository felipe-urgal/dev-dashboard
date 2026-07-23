#!/usr/bin/env bash
# ============================================================
# GENERATORS HELPERS — Escolha de banco para múltiplos schemas
# ============================================================
_dev_choose_database() {
  local project="$1"
  local -a databases
  readarray -t databases < <(project-databases "$project")
  if [ ${#databases[@]} -le 1 ]; then
    return 0
  fi

  local chosen=""
  if _dev_has gum; then
    chosen=$(printf '%s\n' "${databases[@]}" | gum choose --header "Escolha o banco de dados:")
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
  [ -n "$chosen" ] && echo "$chosen"
}