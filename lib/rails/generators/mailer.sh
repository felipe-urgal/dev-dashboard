#!/usr/bin/env bash
# ============================================================
# Mailer Generator
# ============================================================

_generators_mailer() {
  local rails_cmd="$1"

  local name=""
  if _dev_has gum; then
    name=$(gum input --header "Nome do mailer:" --placeholder "UserMailer")
  else
    read -r -p "Nome do mailer: " name
  fi
  [ -z "$name" ] && return

  _dev_ok "Gerando mailer $name..."
  $rails_cmd g mailer "$name"
}