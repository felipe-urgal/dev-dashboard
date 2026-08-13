#!/usr/bin/env bash
# ============================================================
# PUBLISH HELPERS — Menu de ações, force push, PR URL, browser
# ============================================================

_publish_select_action() {
  local branch="$1"
  local pr_info="$2"
  _dev_clear
  _dev_breadcrumb "Git" "Publicar"
  echo >&2
  _dev_step "O que deseja fazer com a branch '$branch'?"
  if [ -n "$pr_info" ]; then
    echo >&2
    _dev_ok "$pr_info"
  fi
  echo >&2

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Publicar;Enviar a branch normalmente para o remote\n"
    rows+="Rebase + Publicar;Fazer rebase na branch principal antes de enviar\n"
    rows+="Publicar (--force);Forçar o envio, sobrescrevendo o histórico remoto\n"
    rows+="Voltar;Cancelar e voltar ao menu anterior\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -z "$selected" ] && { echo "voltar"; return; }
    local action
    action=$(echo "$selected" | cut -d';' -f1 | xargs)
    case "$action" in
      "Publicar")           echo "normal" ;;
      "Rebase + Publicar")  echo "rebase" ;;
      "Publicar (--force)") echo "force" ;;
      *)                    echo "voltar" ;;
    esac
  else
    echo "O que deseja fazer com a branch '$branch'?" >&2
    echo "  1) Publicar" >&2
    echo "  2) Rebase + Publicar" >&2
    echo "  3) Publicar (--force)" >&2
    echo "  4) Voltar" >&2
    read -r -p "Número: " choice
    case "$choice" in
      1) echo "normal" ;;
      2) echo "rebase" ;;
      3) echo "force" ;;
      *) echo "voltar" ;;
    esac
  fi
}

# Verifica se já existe uma PR aberta para a branch atual (requer gh CLI).
# Retorna via stdout um resumo (vazio se não há PR ou gh indisponível).
_publish_check_existing_pr() {
  _dev_has gh || return 0
  local pr_json
  pr_json=$(gh pr view --json number,title,state,url 2>/dev/null) || return 0
  [ -z "$pr_json" ] && return 0

  local number title state url
  number=$(echo "$pr_json" | grep -oE '"number":[0-9]+' | grep -oE '[0-9]+')
  state=$(echo "$pr_json" | grep -oE '"state":"[^"]*"' | cut -d'"' -f4)
  url=$(echo "$pr_json" | grep -oE '"url":"[^"]*"' | cut -d'"' -f4)
  title=$(echo "$pr_json" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p')

  [ -z "$number" ] && return 0
  echo "PR #$number já existe ($state): $title — $url"
}

_publish_confirm_force() {
  _dev_clear
  _dev_breadcrumb "Git" "Publicar" "Confirmar force"
  echo >&2
  _dev_step "Esta ação sobrescreve o histórico remoto. Tem certeza?"
  if _dev_has gum; then
    gum confirm "" --default=false --affirmative="Sim" --negative="Não" && return 0
  else
    read -r -p "Tem certeza? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && return 0
  fi
  return 1
}

_publish_extract_pr_url() {
  grep -oE 'https://github\.com/[^[:space:]]+/pull/new/[^[:space:]]+' "$1" | head -n1
}

_publish_ask_open_pr() {
  _dev_step "Deseja abrir o link da Pull Request no navegador?"
  if _dev_has gum; then
    gum confirm "" --affirmative="Sim" --negative="Não" && return 0
  else
    read -r -p "Deseja abrir o link da Pull Request? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && return 0
  fi
  return 1
}

_dev_open_url() {
  local url="$1"
  if [ -z "$url" ]; then
    return 1
  fi
  if [ -n "${BROWSER:-}" ]; then
    "$BROWSER" "$url" >/dev/null 2>&1 &
  elif _dev_has xdg-open; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif _dev_has open; then
    open "$url" >/dev/null 2>&1 &
  elif _dev_has sensible-browser; then
    sensible-browser "$url" >/dev/null 2>&1 &
  elif _dev_has wslview; then
    wslview "$url" >/dev/null 2>&1 &
  else
    _dev_err "Não foi possível abrir o navegador. Acesse manualmente: $url"
    return 1
  fi
  disown
}