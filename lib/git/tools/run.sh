#!/usr/bin/env bash
# ============================================================
# git-tools — Cliente TUI dos contratos Git atuais
# ============================================================

_git_branches_menu() {
  local project="$1"

  while true; do
    local action
    action=$(_git_api_choose "Branches" \
      "Listar branches" \
      "Criar branch local" \
      "Trocar branch local" \
      "Publicar branch no origin" \
      "Rastrear branch do origin" \
      "Excluir branch local" \
      "Excluir branch do origin" \
      "Voltar") || return 0

    case "$action" in
      "Listar branches")
        _git_api_workspace "$project"
        _dev_pause
        ;;
      "Criar branch local")
        local prefix name branch_name
        prefix=$(_git_api_choose "Prefixo" "feature/" "bugfix/" "hotfix/" "docs/" "refactor/" "test/") || continue
        name=$(_git_api_input "Nome da branch")
        [ -z "$name" ] && continue
        branch_name="${prefix}${name}"
        if _git_api_confirm "Criar '$branch_name' a partir da branch atual?"; then
          _git_api create-branch "$project" "$branch_name"
          _dev_pause
        fi
        ;;
      "Trocar branch local")
        local -a local_branches=()
        readarray -t local_branches < <(_git_local_branches "$project")
        local selected
        selected=$(_git_api_choose "Branch local" "${local_branches[@]}") || continue
        if _git_api_confirm "Trocar para '$selected'?"; then
          _git_api switch-branch "$project" "$selected"
          _dev_pause
        fi
        ;;
      "Publicar branch no origin")
        local -a publishable=()
        readarray -t publishable < <(_git_local_branches "$project")
        local selected
        selected=$(_git_api_choose "Branch local" "${publishable[@]}") || continue
        if _git_api_confirm "Publicar '$selected' no origin?"; then
          _git_api publish-branch "$project" "$selected"
          _dev_pause
        fi
        ;;
      "Rastrear branch do origin")
        local -a remote_branches=()
        readarray -t remote_branches < <(_git_remote_origin_branches "$project")
        local selected
        selected=$(_git_api_choose "Branch remota" "${remote_branches[@]}") || continue
        if _git_api_confirm "Criar branch local rastreando '$selected'?"; then
          _git_api track-branch "$project" "$selected"
          _dev_pause
        fi
        ;;
      "Excluir branch local")
        local current
        current=$(_git_current_branch "$project")
        local -a deletable=()
        while IFS= read -r branch_name; do
          [ -n "$branch_name" ] && [ "$branch_name" != "$current" ] && deletable+=("$branch_name")
        done < <(_git_local_branches "$project")
        local selected
        selected=$(_git_api_choose "Branch local" "${deletable[@]}") || continue
        if _git_api_confirm "Excluir branch local '$selected'?"; then
          _git_api delete-branch "$project" "$selected"
          _dev_pause
        fi
        ;;
      "Excluir branch do origin")
        local -a remote_branches=()
        readarray -t remote_branches < <(_git_remote_origin_branches "$project")
        local selected
        selected=$(_git_api_choose "Branch remota" "${remote_branches[@]}") || continue
        if _git_api_confirm "Excluir '$selected' do origin?"; then
          _git_api delete-remote-branch "$project" "$selected"
          _dev_pause
        fi
        ;;
      *) return 0 ;;
    esac
  done
}

_git_commit_menu() {
  local project="$1"
  local mode
  mode=$(_git_api_choose "Commit" "Novo commit" "Amend" "Voltar") || return 0
  [ "$mode" = "Voltar" ] && return 0

  local message
  message=$(_git_api_input "Mensagem")
  [ -z "$message" ] && return 0

  if _git_api_confirm "$mode com a mensagem informada?"; then
    if [ "$mode" = "Amend" ]; then
      _git_api amend "$project" "$message"
    else
      _git_api commit "$project" "$message"
    fi
    _dev_pause
  fi
}

_git_sync_menu() {
  local project="$1"
  local current
  current=$(_git_current_branch "$project")
  [ -z "$current" ] && { _dev_err "Branch atual não encontrada."; _dev_pause; return 1; }

  local reference="origin/$current"
  local strategy
  strategy=$(_git_api_choose "Estratégia" "ff-only" "rebase" "merge") || return 0

  if _git_api_confirm "Sincronizar '$current' com '$reference' usando '$strategy'?"; then
    _git_api sync "$project" "$reference" "$strategy"
    _dev_pause
  fi
}

_git_pr_menu() {
  local project="$1"
  local title base
  title=$(_git_api_input "Título do PR")
  [ -z "$title" ] && return 0
  base=$(_git_api_input "Branch base (padrão: main)")
  [ -z "$base" ] && base="main"

  if _git_api_confirm "Publicar a branch atual se necessário e criar PR para '$base'?"; then
    _git_api create-pr "$project" "$title" "$base"
    _dev_pause
  fi
}

git-tools() {
  local project="$1"
  [ -n "$project" ] || project=$(_tools_detect_project) || {
    _dev_err "Nenhum projeto Git identificado."
    return 1
  }

  if ! _dev_dashboard_api_available; then
    _dev_err "A API local do Dev Dashboard é necessária para o Git TUI."
    _dev_pause
    return 1
  fi

  while true; do
    local action
    action=$(git-menu-select) || break

    case "$action" in
      "Branches") _git_branches_menu "$project" ;;
      "Commit") _git_commit_menu "$project" ;;
      "Sincronizar") _git_sync_menu "$project" ;;
      "Pull Request") _git_pr_menu "$project" ;;
      "Desfazer último commit")
        if _git_api_confirm "Desfazer o último commit usando a estratégia segura definida pelo domínio?"; then
          _git_api undo-commit "$project"
          _dev_pause
        fi
        ;;
      "Ver alterações")
        _git_api overview "$project"
        echo >&2
        _git_api diff "$project"
        _dev_pause
        ;;
      "Histórico")
        _git_api history "$project"
        _dev_pause
        ;;
      "Sair") break ;;
    esac
  done
}
