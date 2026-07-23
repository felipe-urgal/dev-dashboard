#!/usr/bin/env bash
# ============================================================
# GIT HELPERS — Funções compartilhadas entre submódulos Git
# ============================================================

# Prefixo convencional de commit baseado no tipo da branch atual.
# Usado por git-commit e git-save.
_git_branch_prefix() {
  local branch
  branch=$(git branch --show-current)
  local type="${branch%%/*}"
  case "$type" in
    feature)  echo "feat" ;;
    fix)      echo "fix" ;;
    refactor) echo "refactor" ;;
    chore)    echo "chore" ;;
    docs)     echo "docs" ;;
    hotfix)   echo "fix" ;;
    *)        echo "" ;;
  esac
}

# Detecta a branch principal do repositório (main, master, develop...).
_git_default_branch() {
  local ref
  ref=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)
  if [ -n "$ref" ]; then
    echo "${ref#origin/}"
    return 0
  fi
  local candidate
  for candidate in main master develop; do
    if git show-ref --verify --quiet "refs/heads/$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "main"
}

# Retorna 0 se existem alterações não commitadas (staged, unstaged ou untracked).
_git_check_dirty() {
  ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]
}

# Se o working tree estiver sujo, oferece guardar as alterações em stash.
# Retorna 0 se estava limpo ou se o stash foi feito; 1 se o usuário cancelou.
# Seta DEV_STASH_APPLIED=1 quando um stash é criado (para _git_auto_unstash).
_git_auto_stash() {
  DEV_STASH_APPLIED=0
  _git_check_dirty || return 0

  _dev_warn "Existem alterações não commitadas."
  local do_stash=""
  if _dev_has gum; then
    gum confirm "Guardar alterações em stash e continuar?" --affirmative="Sim" --negative="Não" && do_stash="yes"
  else
    read -r -p "Guardar alterações em stash e continuar? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && do_stash="yes"
  fi

  if [ "$do_stash" != "yes" ]; then
    _dev_warn "Operação cancelada. Faça commit ou stash antes de continuar."
    return 1
  fi

  if git stash push --include-untracked -m "dev-dashboard auto-stash"; then
    DEV_STASH_APPLIED=1
    _dev_ok "Alterações guardadas em stash."
    return 0
  fi
  _dev_err "Falha ao criar stash."
  return 1
}

# Se _git_auto_stash guardou alterações, oferece restaurá-las (git stash pop).
_git_auto_unstash() {
  [ "${DEV_STASH_APPLIED:-0}" = "1" ] || return 0
  DEV_STASH_APPLIED=0

  local do_pop=""
  if _dev_has gum; then
    gum confirm "Restaurar alterações guardadas no stash?" --affirmative="Sim" --negative="Não" && do_pop="yes"
  else
    read -r -p "Restaurar alterações guardadas no stash? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && do_pop="yes"
  fi

  if [ "$do_pop" = "yes" ]; then
    if git stash pop; then
      _dev_ok "Alterações restauradas."
    else
      _dev_err "Falha ao restaurar stash (pode haver conflitos). Use 'git stash pop' manualmente."
      return 1
    fi
  else
    _dev_warn "Alterações continuam no stash. Recupere com 'git stash pop' ou pelo menu Stash."
  fi
  return 0
}
