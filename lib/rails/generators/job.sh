#!/usr/bin/env bash
# ============================================================
# Job Generator
# ============================================================

_generators_job() {
  local rails_cmd="$1"

  local name=""
  if _dev_has gum; then
    name=$(gum input --header "Nome do job:" --placeholder "SendWelcomeEmail")
  else
    read -r -p "Nome do job: " name
  fi
  [ -z "$name" ] && return

  _dev_ok "Gerando job $name..."
  $rails_cmd g job "$name"
}