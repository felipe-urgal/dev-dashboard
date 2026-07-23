#!/usr/bin/env bash
# ============================================================
# Scaffold Generator
# ============================================================

_generators_scaffold() {
  local rails_cmd="$1"
  local project="$2"

  local name=""
  if _dev_has gum; then
    name=$(gum input --header "Nome do recurso:" --placeholder "Post")
  else
    read -r -p "Nome do recurso: " name
  fi
  [ -z "$name" ] && return

  local attrs=""
  if _dev_has gum; then
    attrs=$(gum input --header "Atributos (opcional):" --placeholder "title:string body:text")
  else
    read -r -p "Atributos (ex: title:string body:text): " attrs
  fi

  local db=$(_dev_choose_database "$project")
  _dev_ok "Gerando scaffold $name..."
  if [ -n "$db" ]; then
    $rails_cmd g scaffold "$name" $attrs --database="$db"
  else
    $rails_cmd g scaffold "$name" $attrs
  fi
}