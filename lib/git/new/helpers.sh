#!/usr/bin/env bash
# ============================================================
# NEW HELPERS — Seleção de tipo, nome, sanitização
# ============================================================

_new_show_header() { _dev_breadcrumb "$@"; }
_new_step()        { _dev_step "$@"; }
_new_clear()       { _dev_clear; }

_new_hint() {
  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "  esc cancela • enter confirma" >&2
  else
    echo "  (ESC não suportado neste modo — deixe vazio para cancelar)" >&2
  fi
}

_new_select_type() {
  local types=("feature" "fix" "refactor" "chore" "docs" "hotfix")
  _new_clear
  _new_show_header "Git" "Nova branch"
  echo >&2
  _new_step "Selecione o tipo da branch que será criada"
  echo >&2

  if _dev_has gum; then
    local rows="Tipo;Descrição\n"
    rows+="feature;Nova funcionalidade\n"
    rows+="fix;Correção de bug\n"
    rows+="refactor;Melhorar código\n"
    rows+="chore;Manutenção\n"
    rows+="docs;Documentação\n"
    rows+="hotfix;Correção urgente\n"
    # rows+="Voltar;Voltar sem criar branch\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -z "$selected" ] && return 1
    local type
    type=$(echo "$selected" | cut -d';' -f1 | xargs)
    # [ "$type" = "Voltar" ] && return 0
    echo "$type"
  else
    echo "Escolha o tipo da branch:" >&2
    local i=1
    for t in "${types[@]}"; do
      echo "  $i) $t" >&2
      ((i++))
    done
    # echo "  $i) Voltar" >&2
    read -r -p "Número: " choice
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -eq "$i" ]; then
      return 1
    fi
    if [ "$choice" -ge 1 ] && [ "$choice" -le ${#types[@]} ]; then
      echo "${types[$((choice-1))]}"
    else
      return 1
    fi
  fi
}

_new_ask_name() {
  local type="$1"
  local placeholder="ex: login-social"

  _new_clear
  _new_show_header "Git" "Nova branch" "$type"
  echo >&2
  _new_step "Digite o nome da branch (sem o prefixo de tipo)."
  echo >&2

  local name
  if _dev_has gum; then
    name=$(gum input --placeholder "$placeholder")
  else
    read -r -p "Nome da branch: " name
  fi

  # Se o usuário deu Tab e aceitou o placeholder como valor literal, invalida
  if [ "$name" = "$placeholder" ]; then
    name=""
  fi

  echo "$name"
}

_new_sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | sed 's/^-//' | sed 's/-$//'
}

_new_branch_exists() {
  local branch="$1"
  git show-ref --verify --quiet "refs/heads/${branch}"
}

_new_confirm_create() {
  local branch="$1"
  if _dev_has gum; then
    gum confirm "Criar branch ${branch}?"
  else
    read -r -p "Criar branch ${branch}? [s/N]: " ans
    [[ "$ans" =~ ^[sS]$ ]]
  fi
}