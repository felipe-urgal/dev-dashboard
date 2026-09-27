project-menu() {
  local rows="Projeto;Status;Porta;Branch\n"
  local has_running_server=false
  local api_snapshot=""

  if _dev_dashboard_api_available; then
    api_snapshot=$(_dev_dashboard_snapshot 2>/dev/null) || api_snapshot=""
  fi

  if [ -n "$api_snapshot" ]; then
    while IFS=$'\t' read -r project_id project_name project_path project_type enabled port runtime_status environment_instance_id pid; do
      [ -z "$project_name" ] && continue
      local branch_info
      branch_info=$(_dev_get_branch_info "$project_path")
      local symbol
      symbol=$(_dev_runtime_status_symbol "$runtime_status")
      rows+="$project_name;$symbol $runtime_status;${port:-};$branch_info\n"
      [ "$runtime_status" = "running" ] || [ "$runtime_status" = "starting" ] && has_running_server=true
    done <<< "$api_snapshot"
  else
    local -a projects
    local project
    if [ ${#PROJECT_META[@]} -gt 0 ]; then
      readarray -t projects < <(project-list)
    fi
    for project in "${projects[@]}"; do
      local port
      port=$(project-port "$project") || port=""
      local path
      path=$(project-path "$project") || path=""
      local branch_info
      branch_info=$(_dev_get_branch_info "$path")
      # API indisponível: porta não prova ownership; estado fica unknown.
      rows+="$project;❔ unknown;$port;$branch_info\n"
    done
  fi

  if [ "$rows" = "Projeto;Status;Porta;Branch\n" ]; then
    if _dev_has gum; then
      printf "Ação;Descrição\nSair;Sair do dashboard\n" | gum table --separator=";" --border="rounded" --border.foreground="#7C3AED" --header.foreground="#7C3AED"
    else
      echo "Nenhum projeto encontrado." >&2
      echo "Sair"
    fi
    return
  fi

  [ "$has_running_server" = true ] && rows+="Parar todos servidores;;;\n"
  rows+="Iniciar todos servidores;;;\n"
  rows+="Sair;;;\n"

  local selected
  if _dev_has gum; then
    selected=$(printf "%b" "$rows" | gum table --separator=";" --border="rounded" --border.foreground="#7C3AED" --header.foreground="#7C3AED" --height 15)
  else
    printf "%b" "$rows" >&2
    read -r -p "Projeto ou ação: " selected
  fi

  [ -z "$selected" ] && { echo "Sair"; return; }
  echo "$selected" | cut -d';' -f1 | xargs
}
dev-project-actions() {
  local project="$1"
  local type
  type=$(project-type "$project") || type=""
  local rows="Ação;Descrição\n"

  rows+="Git;Abrir menu Git\n"
  rows+="Abrir no navegador;Abrir http://localhost:porta\n"
  rows+="Abrir no editor;Abrir projeto no editor configurado\n"
  rows+="Terminal;Abrir terminal no diretório do projeto\n"

  if declare -f _dev_has_any_server &>/dev/null; then
    if _dev_has_any_server; then
      rows+="Status dos servidores;Ver servidores em execução\n"
    fi
  fi

  if [ "$type" = "rails" ]; then
    rows+="Comandos Rails;Submenu de comandos Rails\n"
  else
    rows+="Comandos Node;Submenu de comandos Node\n"
  fi

  rows+="Voltar;Voltar ao menu de projetos\n"

  local selected
  if _dev_has gum; then
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" --border="rounded" --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED" --height 15)
  else
    echo "Ações para $project:" >&2
    local -a options=("Git" "Abrir no navegador" "Abrir no editor" "Terminal")

    if declare -f _dev_has_any_server &>/dev/null && _dev_has_any_server; then
      options+=("Status dos servidores")
    fi
    if [ "$type" = "rails" ]; then
      options+=("Comandos Rails")
    else
      options+=("Comandos Node")
    fi
    options+=("Voltar")

    local i=1
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      selected="${options[$((choice-1))]}"
    else
      selected="Voltar"
    fi
  fi

  [ -z "$selected" ] && { echo "Voltar"; return; }

  local action
  action=$(echo "$selected" | cut -d';' -f1 | xargs)
  echo "$action"
}