#!/usr/bin/env bash
# ============================================================
# DELETE HELPERS — Listagem, seleção, confirmação, checkout
# ============================================================
_delete_list_branches() {
  git branch --format='%(refname:short)' | grep -vE '^(main|master)$'
}

_delete_select_branch() {
  local -a branches
  readarray -t branches < <(_delete_list_branches)

  _dev_clear
  _dev_breadcrumb "Git" "Excluir branch"
  echo >&2

  if [ ${#branches[@]} -eq 0 ]; then
    _dev_step "Nenhuma branch local disponível para remoção (além de main/master)."
    return 1
  fi

  _dev_step "Escolha a branch que deseja remover."
  echo >&2

  if _dev_has gum; then
    printf '%s\n' "${branches[@]}" | gum choose --header "Branches disponíveis:"
  else
    echo "Branches disponíveis para remover:" >&2
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

_delete_confirm() {
  local branch="$1"
  _dev_clear
  _dev_breadcrumb "Git" "Excluir branch" "Confirmar"
  echo >&2
  _dev_step "Excluir a branch '$branch'? Esta ação não pode ser desfeita."
  if _dev_has gum; then
    gum confirm "" --default=false --affirmative="Sim" --negative="Não" && return 0
  else
    read -r -p "Tem certeza que deseja excluir '$branch'? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && return 0
  fi
  return 1
}

_delete_checkout_safe() {
  local branch="$1"
  local current_branch=$(git branch --show-current)
  if [ "$current_branch" != "$branch" ]; then
    return 0
  fi
  local target=""
  if git show-ref --verify --quiet refs/heads/main; then
    target="main"
  elif git show-ref --verify --quiet refs/heads/master; then
    target="master"
  else
    _dev_err "Branch '$branch' é a atual e não há 'main' nem 'master' para alternar. Abortando."
    return 1
  fi
  _dev_ok "Alternando para $target..."
  if ! git checkout "$target" 2>/dev/null; then
    _dev_err "Falha ao alternar para $target. Abortando exclusão."
    return 1
  fi
  return 0
}
