#!/usr/bin/env bash
# ============================================================
# GIT API — Cliente da TUI para os contratos Git da API
# ============================================================

_git_api() {
  node "$DEV_DASHBOARD_DIR/scripts/terminal-git-api.mjs" "$@"
}

_git_api_workspace() {
  _git_api workspace "$1"
}

_git_api_confirm() {
  local prompt="$1"
  if _dev_has gum; then
    gum confirm "$prompt" --default=false --affirmative="Sim" --negative="Não"
  else
    read -r -p "$prompt (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]]
  fi
}

_git_api_input() {
  local prompt="$1"
  local value=""
  if _dev_has gum; then
    value=$(gum input --placeholder "$prompt")
  else
    read -r -p "$prompt: " value
  fi
  printf '%s' "$value"
}

_git_api_choose() {
  local prompt="$1"
  shift
  local -a options=("$@")
  [ ${#options[@]} -eq 0 ] && return 1

  if _dev_has gum; then
    printf '%s\n' "${options[@]}" | gum choose --header "$prompt"
  else
    echo "$prompt" >&2
    local i=1 option
    for option in "${options[@]}"; do
      echo "  $i) $option" >&2
      ((i++))
    done
    read -r -p "Escolha: " choice
    [[ "$choice" =~ ^[0-9]+$ ]] || return 1
    (( choice >= 1 && choice <= ${#options[@]} )) || return 1
    printf '%s' "${options[$((choice-1))]}"
  fi
}

_git_branch_rows() {
  _git_api_workspace "$1"
}

_git_local_branches() {
  _git_branch_rows "$1" | awk -F '\t' '$1=="local" {print $3}'
}

_git_remote_origin_branches() {
  _git_branch_rows "$1" | awk -F '\t' '$1=="remote" && $3 ~ /^origin\// {print $3}'
}

_git_current_branch() {
  _git_branch_rows "$1" | awk -F '\t' '$1=="local" && $2=="*" {print $3; exit}'
}
