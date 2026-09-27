#!/usr/bin/env bash
# ============================================================
# git-menu-select — Menu Git alinhado aos contratos atuais
# ============================================================
git-menu-select() {
  local -a actions=(
    "Branches"
    "Commit"
    "Sincronizar"
    "Pull Request"
    "Desfazer último commit"
    "Ver alterações"
    "Histórico"
    "Sair"
  )

  _dev_clear
  _dev_breadcrumb "Git"
  echo >&2
  _dev_step "Selecione uma ação Git."
  echo >&2

  local selected=""
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Branches;Criar, trocar, publicar, rastrear ou excluir branches\n"
    rows+="Commit;Criar commit ou amend com confirmação do domínio\n"
    rows+="Sincronizar;Sincronizar branch atual com uma referência remota\n"
    rows+="Pull Request;Publicar branch e criar PR pelo contrato atual\n"
    rows+="Desfazer último commit;Executar undo fail-closed do último commit\n"
    rows+="Ver alterações;Consultar overview e diff combinados\n"
    rows+="Histórico;Consultar commits exclusivos da branch atual\n"
    rows+="Sair;Voltar ao menu do projeto\n"
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" --border="rounded" --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && selected=$(echo "$selected" | cut -d';' -f1 | xargs)
  else
    echo "Git" >&2
    local i=1 action
    for action in "${actions[@]}"; do
      echo "  $i) $action" >&2
      ((i++))
    done
    read -r -p "Escolha: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#actions[@]} )); then
      selected="${actions[$((choice-1))]}"
    fi
  fi

  [ -z "$selected" ] && return 1
  printf '%s\n' "$selected"
}
