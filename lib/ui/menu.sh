#!/usr/bin/env bash
# ============================================================
# UI MENUS — Menus de projetos e ações
# ============================================================

project-menu() {
  local -a projects
  local project
  if [ ${#PROJECT_META[@]} -gt 0 ]; then
    readarray -t projects < <(project-list)
  fi

  if [ ${#projects[@]} -eq 0 ]; then
    if _dev_has gum; then
      printf "Ação;Descrição\nSair;Sair do dashboard\n" | gum table \
        --separator=";" --border="rounded" --border.foreground="#7C3AED" --header.foreground="#7C3AED"
    else
      echo "Nenhum projeto encontrado." >&2
      echo "1) Sair" >&2
      read -r -p "Escolha: " choice
      echo "Sair"
    fi
    return
  fi

  local has_running_server=false
  local rows="Projeto;Status;Porta;Branch\n"
  for project in "${projects[@]}"; do
    local port
    port=$(project-port "$project") || port=""
    local status="🔴"
    if [ -n "$port" ] && _is_port_in_use "$port"; then
      status="🟢"
      has_running_server=true
    fi
    local path
    path=$(project-path "$project") || path=""
    local branch_info
    branch_info=$(_dev_get_branch_info "$path")
    rows+="$project;$status;$port;$branch_info\n"
  done

  if [ "$has_running_server" = true ]; then
    rows+="Parar todos servidores;;;\n"
  fi
  rows+="Iniciar todos servidores;;;\n"
  rows+="Sair;;;\n"

  local selected
  if _dev_has gum; then
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" --border="rounded" --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED" --height 15)
  else
    echo "Projetos disponíveis:" >&2
    local -a options=()
    local i=1
    for project in "${projects[@]}"; do
      local port
      port=$(project-port "$project") || port="?"
      local path
      path=$(project-path "$project") || path=""
      local branch_info
      branch_info=$(_dev_get_branch_info "$path")
      local status_text="🔴"
      if [ -n "$port" ] && _is_port_in_use "$port"; then
        status_text="🟢"
      fi
      echo "  $i) $status_text $project (porta $port) $branch_info" >&2
      options+=("$project")
      ((i++))
    done
    if [ "$has_running_server" = true ]; then
      echo "  $i) Parar todos servidores" >&2
      options+=("Parar todos servidores")
      ((i++))
    fi
    echo "  $i) Iniciar todos servidores" >&2
    options+=("Iniciar todos servidores")
    ((i++))
    echo "  $i) Sair" >&2
    options+=("Sair")

    read -r -p "Escolha o número: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      selected="${options[$((choice-1))]}"
    else
      selected="Sair"
    fi
  fi

  [ -z "$selected" ] && { echo "Sair"; return; }

  local action
  action=$(echo "$selected" | cut -d';' -f1 | xargs)
  echo "$action"
}

dev-project-actions() {
  local project="$1"
  local type
  type=$(project-type "$project") || type=""
  local rows="Ação;Descrição\n"

  rows+="Git;Abrir menu Git\n"
  rows+="Abrir no navegador;Abrir http://localhost:porta\n"
  rows+="Abrir no Sublime;Abrir projeto no Sublime Text\n"
  rows+="Terminal;Abrir terminal no diretório do projeto\n"
  rows+="Assistente IA;Abrir Claude Code (nova sessão, continuar ou retomar)\n"
  rows+="Code Review (IA);Pedir ao Claude Code um review do diff atual\n"
  rows+="QA (IA);Pedir ao Claude Code para testar as mudanças atuais\n"
  rows+="Segurança (IA);Pedir ao Claude Code uma revisão de segurança das mudanças\n"
  rows+="Simplificar (IA);Pedir ao Claude Code uma limpeza de reuso/simplificação\n"

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
    local -a options=("Git" "Abrir no navegador" "Abrir no Sublime" "Terminal" "Assistente IA" "Code Review (IA)" "QA (IA)" "Segurança (IA)" "Simplificar (IA)")

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