#!/usr/bin/env bash
# ============================================================
# STATUS HELPERS — Listagem, cores, seleção, diff
# ============================================================
_status_list_files() {
  git status --porcelain | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local status="${line:0:2}"
    local file="${line:3}"
    file="${file%\"}"
    file="${file#\"}"
    local color=""
    case "${status:0:1}" in
      M|A|R|C) color="\033[33m" ;;
      D)       color="\033[31m" ;;
      \?)      color="\033[32m" ;;
      *)       color="\033[0m"  ;;
    esac
    printf "  ${color}%s %s\033[0m\n" "$status" "$file"
  done
}

_status_get_files() {
  git status --porcelain | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local status="${line:0:2}"
    local file="${line:3}"
    file="${file%\"}"
    file="${file#\"}"
    echo "$status|$file"
  done
}

_status_menu_show() {
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Ver diff de um arquivo;Escolher um arquivo específico para visualizar\n"
    rows+="Ver diff de TODOS os arquivos;Mostrar diff completo de tudo alterado\n"
    rows+="Voltar;Sair da visualização\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -z "$selected" ] && { echo "Voltar"; return; }
    echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Ver diff de um arquivo" "Ver diff de TODOS os arquivos" "Voltar")
    local i=1
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha: " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#options[@]} ]; then
      echo "${options[$((num-1))]}"
    else
      echo "Voltar"
    fi
  fi
}

_status_select_file() {
  local all_files="$1"
  local -a names=()
  local -a statuses=()
  while IFS='|' read -r st name; do
    names+=("$name")
    statuses+=("$st")
  done <<< "$all_files"

  if [ ${#names[@]} -eq 0 ]; then
    return 1
  fi

  local selected
  if _dev_has gum; then
    selected=$(printf '%s\n' "${names[@]}" | gum filter --placeholder "Digite para buscar o arquivo..." --height 15)
  else
    echo "Arquivos disponíveis:" >&2
    local j=1
    for f in "${names[@]}"; do
      echo "  $j) $f" >&2
      ((j++))
    done
    read -r -p "Número do arquivo: " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#names[@]} ]; then
      selected="${names[$((num-1))]}"
    fi
  fi

  [ -z "$selected" ] && return 1

  local idx
  for idx in "${!names[@]}"; do
    if [ "${names[$idx]}" = "$selected" ]; then
      echo "${statuses[$idx]}|$selected"
      return 0
    fi
  done
  return 1
}

_show_diff() {
  local diff_cmd="$1"
  local file="$2"
  local cmd
  if [ -n "$file" ]; then
    cmd="$diff_cmd --color=always -- \"$file\""
  else
    cmd="$diff_cmd --color=always"
  fi

  _dev_clear
  _dev_breadcrumb "Git" "Ver alterações" "Diff"
  echo >&2
  _dev_step "Diff: ${file:-todos os arquivos}"
  echo >&2

  if _dev_has diff-so-fancy; then
    bash -c "$cmd" | diff-so-fancy | less -R
  elif _dev_has bat; then
    bash -c "$cmd" | bat --paging=always -l diff
  elif command -v less &>/dev/null; then
    bash -c "$cmd" | less -R
  else
    bash -c "$cmd"
  fi
  echo
  _dev_pause
}

_show_new_file() {
  local file="$1"

  _dev_clear
  _dev_breadcrumb "Git" "Ver alterações" "Arquivo novo"
  echo >&2
  _dev_step "Arquivo não rastreado: $file"
  echo >&2

  if _dev_has bat; then
    bat --paging=always "$file"
  elif command -v less &>/dev/null; then
    less -R "$file"
  else
    cat "$file"
  fi
  echo
  _dev_pause
}