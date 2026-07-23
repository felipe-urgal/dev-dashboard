#!/usr/bin/env bash
# ============================================================
# git-menu-select — Menu principal do Git Helper
# ============================================================
git-menu-select() {
  local -a actions=(
    "Nova branch"
    "Switch branch"
    "Commit"
    "Publicar"
    "Criar PR"
    "Sincronizar branch"
    "Atualizar main"
    "Stash"
    "Excluir branch"
    "Desfazer alterações"
    "Ver alterações"
    "Ver commits"
    "Sair"
  )

  _dev_clear
  _dev_breadcrumb "Git"
  echo >&2
  _dev_step "Selecione uma ação do Git Helper."
  echo >&2

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    local IFS=';'
    local -a descs=($(_menu_descriptions))
    local i=0
    for action in "${actions[@]}"; do
      rows+="${action};${descs[$i]}\n"
      ((i++))
    done
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -z "$selected" ] && return 1
    local action
    action=$(echo "$selected" | cut -d';' -f1 | xargs)
    echo "$action"
  else
    echo "Git Helper" >&2
    echo "==========" >&2
    local i=1
    for action in "${actions[@]}"; do
      echo "  $i) $action" >&2
      ((i++))
    done
    echo >&2
    read -r -p "Escolha uma opção: " choice
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#actions[@]} ]; then
      return 1
    fi
    echo "${actions[$((choice-1))]}"
  fi
}