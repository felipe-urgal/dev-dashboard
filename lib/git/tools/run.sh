#!/usr/bin/env bash
# ============================================================
# git-tools — Loop principal do Git Helper
# ============================================================

git-tools() {
  local project="$1"

  # Se nenhum projeto foi passado, tenta detectar pelo diretório atual
  if [ -z "$project" ]; then
    project=$(_tools_detect_project)
    if [ -z "$project" ]; then
      _dev_err "Nenhum projeto informado e diretório atual não é um projeto conhecido."
      return 1
    fi
  fi

  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado nos metadados."
    return 1
  }

  # Salva diretório original para restaurar ao sair
  local original_dir="$PWD"

  # Verifica se o diretório do projeto é um repositório git
  if ! git -C "$path" rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "O diretório '$path' não é um repositório Git."
    _dev_pause
    return 1
  fi

  while true; do
    clear
    # _dev_show_project_header "$project" "$path"

    local action
    action=$(git-menu-select)
    # Se voltar vazio (ESC ou cancelar), sai do loop
    [ -z "$action" ] && break

    case "$action" in
      "Nova branch")          git-new ;;
      "Switch branch")        git-switch ;;
      "Commit")               git-commit ;;
      "Publicar")             git-publish ;;
      "Criar PR")             git-pr ;;
      "Sincronizar branch")   git-sync ;;
      "Atualizar main")       git-update ;;
      "Stash")                git-stash ;;
      "Excluir branch")       git-delete ;;
      "Desfazer alterações")  git-undo ;;
      "Ver alterações")       git-status-diff ;;
      "Ver commits")          git-log ;;
      "Sair")                 break ;;
      *)                      _dev_warn "Ação desconhecida: $action" ; _dev_pause ;;
    esac
  done

  # Restaura diretório original
  cd "$original_dir" >/dev/null 2>&1
}