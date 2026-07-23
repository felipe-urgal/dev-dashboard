#!/usr/bin/env bash
# ============================================================
# dev-sublime — Abre o projeto em um editor de código
# ============================================================
dev-sublime() {
  local project="$1"
  local path
  path=$(project-path "$project") || path=""
  if [ -z "$path" ] || [ ! -d "$path" ]; then
    _dev_err "Caminho do projeto '$project' não encontrado."
    sleep 3
    return 1
  fi

  local editor="${DEV_EDITOR:-}"
  if [ -z "$editor" ]; then
    if _dev_has subl; then
      editor="subl"
    elif _dev_has code; then
      editor="code"
    elif _dev_has gedit; then
      editor="gedit"
    else
      _dev_err "Nenhum editor gráfico encontrado (tente export DEV_EDITOR='code')."
      sleep 3
      return 1
    fi
  fi

  if ! _dev_has "$editor"; then
    _dev_err "Editor '$editor' não encontrado no PATH."
    sleep 3
    return 1
  fi

  _dev_clear
  _dev_breadcrumb "$path" "$project" "Abrir editor"
  echo >&2
  _dev_step "Abrindo com '$editor'..."
  echo >&2

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ $editor \"$path\"" >&2
  else
    echo "\$ $editor \"$path\"" >&2
  fi

  "$editor" "$path" >/dev/null 2>&1 &
  disown

  _dev_ok "Editor aberto para '$project'."
  sleep 3
}