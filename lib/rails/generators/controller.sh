#!/usr/bin/env bash
# ============================================================
# Controller Generator
# ============================================================

_generators_controller() {
  local rails_cmd="$1"

  local name=""
  if _dev_has gum; then
    name=$(gum input --header "Nome do controller:" --placeholder "Users")
  else
    read -r -p "Nome do controller: " name
  fi
  [ -z "$name" ] && return

  local actions=""
  if _dev_has gum; then
    actions=$(gum input --header "Ações (opcional):" --placeholder "index show")
  else
    read -r -p "Ações (ex: index show): " actions
  fi

  _dev_ok "Gerando controller $name..."
  $rails_cmd g controller "$name" $actions
}