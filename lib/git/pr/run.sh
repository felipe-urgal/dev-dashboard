#!/usr/bin/env bash
# ============================================================
# git-pr — Cria/gerencia a Pull Request da branch atual (via gh)
# ============================================================
git-pr() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi

  if ! _dev_has gh; then
    _dev_err "GitHub CLI (comando 'gh') não encontrado no PATH."
    echo "Instale em: https://cli.github.com/" >&2
    _dev_pause
    return 1
  fi

  local branch
  branch=$(git branch --show-current)
  if [ -z "$branch" ]; then
    _dev_err "Não foi possível determinar a branch atual."
    sleep 2
    return 1
  fi

  local default_branch
  default_branch=$(_git_default_branch)
  if [ "$branch" = "$default_branch" ]; then
    _dev_err "Você está na branch principal ('$default_branch'). Troque para uma branch de feature antes de criar uma PR."
    sleep 3
    return 1
  fi

  if ! git rev-parse --abbrev-ref --symbolic-full-name "@{u}" &>/dev/null; then
    _dev_warn "A branch '$branch' ainda não foi publicada no remote."
    local do_publish=""
    if _dev_has gum; then
      gum confirm "Publicar agora com git-publish?" --affirmative="Sim" --negative="Não" && do_publish="yes"
    else
      read -r -p "Publicar agora? (s/N) " answer
      [[ "$answer" =~ ^[Ss] ]] && do_publish="yes"
    fi
    if [ "$do_publish" = "yes" ]; then
      git-publish || return 1
    else
      _dev_warn "Operação cancelada. Publique a branch antes de criar a PR."
      sleep 2
      return 1
    fi
  fi

  local pr_info
  pr_info=$(_publish_check_existing_pr)

  local action
  action=$(_pr_select_action "$branch" "$pr_info")
  [ "$action" = "voltar" ] && return 0

  _dev_clear
  _dev_breadcrumb "Git" "Pull Request"
  echo >&2

  case "$action" in
    criar)
      local draft="" fill=""
      if _dev_has gum; then
        gum confirm "Criar como draft?" --default=false --affirmative="Sim" --negative="Não" && draft="yes"
        gum confirm "Preencher título/descrição automaticamente a partir dos commits?" --affirmative="Sim" --negative="Não (assistente interativo do gh)" && fill="yes"
      else
        read -r -p "Criar como draft? (s/N) " answer
        [[ "$answer" =~ ^[Ss] ]] && draft="yes"
        read -r -p "Preencher automaticamente a partir dos commits? (S/n) " answer2
        [[ "$answer2" =~ ^[Nn] ]] || fill="yes"
      fi

      _pr_create "$default_branch" "$draft" "$fill"
      local ret=$?

      if [ $ret -eq 0 ]; then
        _dev_ok "Pull Request criada com sucesso."
        local url
        url=$(gh pr view --json url -q .url 2>/dev/null)
        if [ -n "$url" ] && _publish_ask_open_pr; then
          _dev_open_url "$url"
        fi
      else
        _dev_err "Falha ao criar a Pull Request (código $ret)."
      fi
      sleep 3
      ;;
    checks)
      _dev_spin "Verificando checks da PR..." gh pr checks
      ;;
    abrir)
      local url
      url=$(gh pr view --json url -q .url 2>/dev/null)
      if [ -n "$url" ]; then
        _dev_ok "Abrindo $url ..."
        _dev_open_url "$url"
        sleep 2
      else
        _dev_err "Não foi possível obter a URL da PR."
        sleep 2
      fi
      ;;
  esac
}
