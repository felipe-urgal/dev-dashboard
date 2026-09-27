#!/usr/bin/env bash
# ============================================================
# UI MENUS — Menus de projetos e ações
# ============================================================

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

      case "$runtime_status" in
        running|starting|stopping) has_running_server=true ;;
      esac
    done <<< "$api_snapshot"
  else
    local -a projects=()
    local project

    if [ ${#PROJECT_META[@]} -gt 0 ]; then
      readarray -t projects < <(project-list)
    fi

    for project in "${projects[@]}"; do
      local port path branch_info
      port=$(project-port "$project") || port=""
      path=$(project-path "$project") || path=""
      branch_info=$(_dev_get_branch_info "$path")

      # Sem API não existe evidência de ownership do Process Manager.
      rows+="$project;❔ unknown;$port;$branch_info\n"
    done
  fi

  if [ "$rows" = "Projeto;Status;Porta;Branch\n" ]; then
    if _dev_has gum; then
      printf "Ação;Descrição\nSair;Sair do dashboard\n" | gum table \
        --separator=";" --border="rounded" --border.foreground="#7C3AED" --header.foreground="#7C3AED"
    else
      echo "Nenhum projeto encontrado." >&2
      echo "Sair"
    fi
    return
  fi

  [ "$has_running_server" = true ] && rows+="Parar todos servidores;;;\n"
  rows+="Iniciar todos servidores;;;\n"
  rows+="Sair;;;\n"

  local selected=""
  if _dev_has gum; then
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" --border="rounded" --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED" --height 15)
  else
    local -a options=()
    local line label
    local i=1

    while IFS= read -r line; do
      [ -z "$line" ] && continue
      [ "$line" = "Projeto;Status;Porta;Branch" ] && continue

      label=$(printf "%s" "$line" | cut -d';' -f1)
      echo "  $i) $line" >&2
      options+=("$label")
      ((i++))
    done < <(printf "%b" "$rows")

    read -r -p "Escolha o número: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      selected="${options[$((choice-1))]}"
    else
      selected="Sair"
    fi
  fi

  [ -z "$selected" ] && { echo "Sair"; return; }
  echo "$selected" | cut -d';' -f1 | xargs
}

dev-project-actions() {
  local project="$1"
  local type=""

  if _dev_dashboard_api_available; then
    local project_record=""
    project_record=$(_dev_dashboard_project_record "$project" 2>/dev/null) || project_record=""
    if [ -n "$project_record" ]; then
      IFS=$'\t' read -r _project_id _project_name _project_path type _enabled _port _status _environment_instance_id _pid <<< "$project_record"
    fi
  fi

  [ -n "$type" ] || type=$(project-type "$project") || type=""

  local rows="Ação;Descrição\n"
  rows+="Git;Abrir menu Git\n"
  rows+="Abrir no navegador;Abrir http://localhost:porta\n"
  rows+="Abrir no editor;Abrir projeto no editor configurado\n"
  rows+="Terminal;Abrir terminal no diretório do projeto\n"

  if declare -f _dev_has_any_server &>/dev/null && _dev_has_any_server; then
    rows+="Status dos servidores;Ver servidores em execução\n"
  fi

  if [ "$type" = "rails" ]; then
    rows+="Comandos Rails;Submenu de comandos Rails\n"
  elif [ "$type" = "node" ]; then
    rows+="Comandos Node;Submenu de comandos Node\n"
  fi

  rows+="Voltar;Voltar ao menu de projetos\n"

  local selected=""
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
    [ "$type" = "rails" ] && options+=("Comandos Rails")
    [ "$type" = "node" ] && options+=("Comandos Node")
    options+=("Voltar")

    local i=1 opt
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
  echo "$selected" | cut -d';' -f1 | xargs
}
