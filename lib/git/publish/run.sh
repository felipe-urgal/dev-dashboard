#!/usr/bin/env bash
# ============================================================
# git-publish — Publica branch atual no origin
# ============================================================
git-publish() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 2
    return 1
  fi
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    _dev_warn "Existem alterações não commitadas. Faça commit ou stash antes de publicar."
    sleep 2
    return 1
  fi

  local branch
  branch=$(git branch --show-current)
  if [ -z "$branch" ]; then
    _dev_err "Não foi possível determinar a branch atual."
    sleep 2
    return 1
  fi

  # ---- Menu de ações ----
  local action
  action=$(_publish_select_action "$branch")

  if [ "$action" = "voltar" ]; then
    return 0
  fi

  local force_flag=""
  if [ "$action" = "force" ]; then
    if _publish_confirm_force; then
      force_flag="--force"
      _dev_warn "Push forçado será utilizado."
    else
      _dev_warn "Operação cancelada."
      sleep 1
      return 0
    fi
  fi

  # Determina o comando de push
  local push_cmd
  if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" &>/dev/null; then
    push_cmd="git push $force_flag"
  else
    push_cmd="git push $force_flag -u origin $branch"
  fi

  _dev_clear
  _dev_breadcrumb "Git" "Publicar" "Executando"
  echo >&2

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ $push_cmd" >&2
  else
    echo "\$ $push_cmd" >&2
  fi

  _dev_ok "Publicando branch '$branch'..."

  local tmp_output
  tmp_output=$(mktemp)
  if _dev_has gum; then
    gum spin --spinner dot --title "Enviando para o remote..." -- bash -c "$push_cmd > '$tmp_output' 2>&1"
  else
    bash -c "$push_cmd" > "$tmp_output" 2>&1
  fi
  local ret=$?

  if [ -s "$tmp_output" ]; then
    if _dev_has bat; then
      bat --paging=never -l gitignore "$tmp_output"
    elif command -v less &>/dev/null; then
      less -R "$tmp_output"
    else
      cat "$tmp_output"
    fi
  fi

  if [ $ret -eq 0 ]; then
    _dev_ok "Branch '$branch' publicada com sucesso."
    local pr_url
    pr_url=$(_publish_extract_pr_url "$tmp_output")
    if [ -n "$pr_url" ]; then
      echo
      if _publish_ask_open_pr; then
        _dev_ok "Abrindo $pr_url ..."
        _dev_open_url "$pr_url"
      fi
    fi
  else
    _dev_err "Falha ao publicar branch '$branch' (código $ret)."
  fi

  rm -f "$tmp_output"
  sleep 3
  return $ret
}