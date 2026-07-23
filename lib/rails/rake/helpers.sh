#!/usr/bin/env bash
# ============================================================
# RAKE HELPERS — Listagem, parsing, menu
# ============================================================
_rake_list_all() {
  bundle exec rake -T 2>/dev/null | awk -F ' # ' '{ print $1 "; " $2 }' | sed 's/^rake //' | sort
}

_rake_needs_file() {
  local description="$1"
  [[ "$description" =~ \[FILE\]|FILE= ]]
}

_rake_menu_show() {
  local -a options=(
    "Listar e executar tarefa"
    "Digitar nome da tarefa manualmente"
  )
  local -a descriptions=(
    "Ver lista de tarefas disponíveis e escolher uma"
    "Digitar o nome da tarefa (e argumentos) diretamente"
  )
  options+=("Voltar")
  descriptions+=("Voltar ao menu Rails")

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    local i
    for i in "${!options[@]}"; do
      rows+="${options[$i]};${descriptions[$i]}\n"
    done
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    echo "Rake Tasks:" >&2
    local j
    for j in "${!options[@]}"; do
      echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
    done
    read -r -p "Escolha uma opção: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]]; then
      local idx=$((choice - 1))
      if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#options[@]} ]; then
        echo "${options[$idx]}"
      fi
    fi
  fi
}

_rake_select_task() {
  local all_tasks="$1"
  if _dev_has gum; then
    printf '%s\n' "$all_tasks" | gum filter --placeholder "Buscar tarefa..." --height 20
  else
    echo "Tarefas disponíveis:" >&2
    local -a lines
    readarray -t lines <<< "$all_tasks"
    local j=1
    local line
    for line in "${lines[@]}"; do
      echo "  $j) $line" >&2
      ((j++))
    done
    read -r -p "Número da tarefa (ou Enter para cancelar): " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#lines[@]} ]; then
      echo "${lines[$((num-1))]}"
    fi
  fi
}

_rake_ask_file() {
  if _dev_has gum; then
    gum input --header "Informe o caminho do arquivo (FILE):" --placeholder "caminho/do/arquivo"
  else
    read -r -p "Caminho do arquivo (FILE): " file
    echo "$file"
  fi
}

_rake_ask_extra_args() {
  if _dev_has gum; then
    gum input --header "Argumentos extras (opcional):" --placeholder "VAR=valor OUTRA=coisa"
  else
    read -r -p "Argumentos extras (opcional): " extra
    echo "$extra"
  fi
}