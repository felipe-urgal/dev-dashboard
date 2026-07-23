#!/usr/bin/env bash
# ============================================================
# PR HELPERS — Menu de ações e criação via gh
# ============================================================

# Mostra o menu de ações da PR. Se já existe uma PR aberta (pr_info não vazio),
# oferece ver checks/abrir no navegador; caso contrário, oferece criar.
_pr_select_action() {
  local branch="$1"
  local pr_info="$2"
  _dev_clear
  _dev_breadcrumb "Git" "Pull Request"
  echo >&2
  _dev_step "Pull Request para a branch '$branch':"
  if [ -n "$pr_info" ]; then
    echo >&2
    _dev_ok "$pr_info"
  fi
  echo >&2

  local -a options=()
  local -a descriptions=()
  if [ -n "$pr_info" ]; then
    options=("Ver status dos checks" "Abrir no navegador" "Voltar")
    descriptions=("Mostrar o resultado dos checks de CI da PR" "Abrir a PR existente no navegador" "Cancelar e voltar ao menu anterior")
  else
    options=("Criar PR" "Voltar")
    descriptions=("Criar uma Pull Request para esta branch via GitHub CLI" "Cancelar e voltar ao menu anterior")
  fi

  local selected=""
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    local i
    for i in "${!options[@]}"; do
      rows+="${options[$i]};${descriptions[$i]}\n"
    done
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && selected=$(echo "$selected" | cut -d';' -f1 | xargs)
  else
    local j
    for j in "${!options[@]}"; do
      echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
    done
    read -r -p "Número: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
      selected="${options[$((choice-1))]}"
    fi
  fi

  case "$selected" in
    "Criar PR")              echo "criar" ;;
    "Ver status dos checks") echo "checks" ;;
    "Abrir no navegador")    echo "abrir" ;;
    *)                       echo "voltar" ;;
  esac
}

# Cria a PR via gh. Se fill="yes", usa --fill (preenche a partir dos commits,
# roda em modo não-interativo com spinner). Caso contrário, roda o assistente
# interativo do próprio gh, anexado ao terminal.
_pr_create() {
  local base="$1"
  local draft="$2"
  local fill="$3"
  local -a args=(pr create --base "$base")
  [ "$draft" = "yes" ] && args+=(--draft)

  if [ "$fill" = "yes" ]; then
    args+=(--fill)
    _dev_spin "Criando Pull Request..." gh "${args[@]}"
    return $?
  fi

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ gh ${args[*]}" >&2
  else
    echo "\$ gh ${args[*]}" >&2
  fi
  gh "${args[@]}"
  return $?
}
