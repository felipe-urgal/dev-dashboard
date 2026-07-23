#!/usr/bin/env bash
# ============================================================
# SIDEKIQ HELPERS — Status, PID e menu
# ============================================================
_SIDEKIQ_PID=""

_sidekiq_running() {
  local id
  id=$(_dev_project_id "$1")
  local pid_file="$DEV_RUN_DIR/sidekiq-${id}.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      _SIDEKIQ_PID="$pid"
      return 0
    fi
  fi
  return 1
}

_sidekiq_cmd() {
  if [ -f "bin/sidekiq" ]; then
    echo "bin/sidekiq"
  else
    echo "bundle exec sidekiq"
  fi
}

_sidekiq_menu_show() {
  local is_running="$1"
  local pid="$2"
  local -a options=()
  local -a descriptions=()

  if $is_running; then
    options+=("Parar Sidekiq" "Ver logs" "Status" "Reiniciar")
    descriptions+=(
      "Parar Sidekiq em execução (PID $pid)"
      "Exibir logs do Sidekiq (less +F)"
      "Verificar status do Sidekiq"
      "Reiniciar Sidekiq"
    )
  else
    options+=("Iniciar Sidekiq" "Status")
    descriptions+=(
      "Iniciar Sidekiq em background"
      "Verificar status do Sidekiq"
    )
  fi
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
    echo "Sidekiq:" >&2
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