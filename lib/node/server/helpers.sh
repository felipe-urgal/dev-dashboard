#!/usr/bin/env bash
# ============================================================
# NODE SERVER HELPERS — Status, menu, ambiente, comando
# ============================================================
_node_server_pid() {
  local port="$1"
  lsof -t -i :"$port" 2>/dev/null | head -n1
}

_node_server_running() {
  local port="$1"
  [ -n "$port" ] && _is_port_in_use "$port"
}

_node_list_envs() {
  find . -maxdepth 1 -name ".env.*" ! -name ".env.local" ! -name ".env.sample" -printf "%f\n" 2>/dev/null | sed 's/^\.env\.//' | sort
}

_node_select_env() {
  local -a envs
  readarray -t envs < <(_node_list_envs)
  if [ ${#envs[@]} -eq 0 ]; then
    _dev_warn "Nenhum arquivo .env.* encontrado. Usando .env padrão (se existir)."
    return 0
  fi

  local chosen=""
  if _dev_has gum; then
    chosen=$(printf '%s\n' "${envs[@]}" | gum choose --header "Escolha o ambiente:")
  else
    echo "Ambientes disponíveis:" >&2
    local i=1
    local env
    for env in "${envs[@]}"; do
      echo "  $i) $env" >&2
      ((i++))
    done
    read -r -p "Escolha o número: " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#envs[@]} ]; then
      chosen="${envs[$((num-1))]}"
    fi
  fi

  [ -z "$chosen" ] && return 1

  local env_file=".env.${chosen}"
  if [ -f "$env_file" ]; then
    cp "$env_file" .env.local
    _dev_ok "Arquivo $env_file copiado para .env.local"
  else
    _dev_warn "Arquivo $env_file não encontrado. Continuando sem ele."
  fi
}

# Detecta o gerenciador de pacotes do projeto no diretório atual.
_node_pkg_manager() {
  if [ -f "pnpm-lock.yaml" ] && _dev_has pnpm; then
    echo "pnpm"
  elif [ -f "yarn.lock" ] && _dev_has yarn; then
    echo "yarn"
  elif _dev_has npm; then
    echo "npm"
  else
    return 1
  fi
}

# Monta o comando para executar um script do package.json.
_node_run_script() {
  local script="$1"
  local pkg
  pkg=$(_node_pkg_manager) || return 1
  case "$pkg" in
    pnpm) echo "pnpm run $script" ;;
    yarn) echo "yarn $script" ;;
    npm)  echo "npm run $script" ;;
  esac
}

_node_dev_cmd() {
  local script
  for script in dev start serve develop; do
    if grep -q "\"$script\"" package.json 2>/dev/null; then
      _node_run_script "$script"
      return $?
    fi
  done
  return 1
}

_node_server_menu_show() {
  local is_running="$1"
  local port="$2"
  local pid="$3"
  local -a options=()

  if $is_running; then
    options+=("Parar servidor" "Reiniciar servidor" "Ver logs")
  else
    options+=("Iniciar servidor")
  fi
  options+=("Voltar")

  if _dev_has gum; then
    local dev_cmd
    dev_cmd=$(_node_dev_cmd) || dev_cmd="comando de dev"

    local rows="Ação;Descrição\n"
    $is_running && rows+="Parar servidor;Parar servidor Node (porta $port, PID $pid)\n"
    $is_running && rows+="Reiniciar servidor;Parar e iniciar novamente o servidor\n"
    $is_running && rows+="Ver logs;Exibir logs do servidor\n"
    ! $is_running && rows+="Iniciar servidor;Iniciar $dev_cmd em segundo plano\n"
    rows+="Voltar;Voltar ao menu Node\n"

    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    echo "Servidor Node:" >&2
    local i=1
    local opt
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha uma opção: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
      echo "${options[$((choice-1))]}"
    fi
  fi
}