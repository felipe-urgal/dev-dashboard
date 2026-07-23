#!/usr/bin/env bash
# ============================================================
# SWITCH HELPERS — Listagem e seleção de branch
# ============================================================
_switch_list_branches() {
  local current_branch=$(git branch --show-current)
  git branch --format='%(refname:short)' | grep -v "^$current_branch$"
}

_switch_select_branch() {
  local -a branches
  readarray -t branches < <(_switch_list_branches)

  _dev_clear
  _dev_breadcrumb "Git" "Switch branch"
  echo >&2

  if [ ${#branches[@]} -eq 0 ]; then
    _dev_step "Nenhuma outra branch local disponível além da atual."
    return 1
  fi

  _dev_step "Selecione a branch para fazer checkout."
  echo >&2

  if _dev_has gum; then
    printf '%s\n' "${branches[@]}" | gum choose --header "Branches disponíveis:"
  else
    echo "Branches disponíveis:" >&2
    local i=1
    for b in "${branches[@]}"; do
      echo "  $i) $b" >&2
      ((i++))
    done
    echo "  $i) Voltar" >&2
    read -r -p "Número: " choice
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -eq "$i" ]; then
      return 1
    fi
    if [ "$choice" -ge 1 ] && [ "$choice" -le ${#branches[@]} ]; then
      echo "${branches[$((choice-1))]}"
    fi
  fi
}