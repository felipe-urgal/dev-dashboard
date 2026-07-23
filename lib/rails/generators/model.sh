#!/usr/bin/env bash
# ============================================================
# Model Generator
# ============================================================

_generators_model() {
  local rails_cmd="$1"
  local project="$2"

  local name=""
  if _dev_has gum; then
    name=$(gum input --header "Nome do model:" --placeholder "User")
  else
    read -r -p "Nome do model: " name
  fi
  [ -z "$name" ] && return

  local attrs=""
  if _dev_has gum; then
    attrs=$(gum input --header "Atributos (opcional):" --placeholder "name:string age:integer")
  else
    read -r -p "Atributos (ex: name:string age:integer): " attrs
  fi

  local db=$(_dev_choose_database "$project")
  _dev_ok "Gerando model $name..."
  if [ -n "$db" ]; then
    $rails_cmd g model "$name" $attrs --database="$db"
  else
    $rails_cmd g model "$name" $attrs
  fi
}