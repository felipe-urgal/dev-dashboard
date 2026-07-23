#!/usr/bin/env bash
# ============================================================
# WEBPACK HELPERS — Status, PID, comando, menu
# ============================================================
_WEBPACK_PID=""

_webpack_running() {
  local project="$1"
  local id
  id=$(_dev_project_id "$project")
  local pid_file="$DEV_RUN_DIR/webpack-${id}.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      _WEBPACK_PID="$pid"
      return 0
    fi
  fi
  return 1
}

_webpack_cmd() {
  if [ -f "bin/webpack-dev-server" ]; then
    echo "bin/webpack-dev-server"
  elif _dev_has yarn && grep -q "webpack-dev-server" package.json 2>/dev/null; then
    echo "yarn webpack-dev-server"
  elif _dev_has npx; then
    echo "npx webpack-dev-server"
  else
    return 1
  fi
}

_webpack_menu_show() {
  local is_running="$1"
  local pid="$2"
  local -a options=()
  local -a descriptions=()

  if $is_running; then
    options+=("Parar webpack" "Ver logs webpack")
    descriptions+=(
      "Parar webpack-dev-server (PID $pid)"
      "Exibir logs do webpack (less +F)"
    )
  else
    options+=("Iniciar webpack (background)")
    descriptions+=("Iniciar webpack-dev-server em segundo plano")
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
    echo "Webpack:" >&2
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