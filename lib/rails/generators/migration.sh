#!/usr/bin/env bash
# ============================================================
# Migration Generator
# ============================================================

_generators_migration() {
  local rails_cmd="$1"
  local project="$2"

  local name=""
  if _dev_has gum; then
    name=$(gum input --header "Nome da migration:" --placeholder "AddColumnToTable")
  else
    read -r -p "Nome da migration: " name
  fi
  [ -z "$name" ] && return

  local db=$(_dev_choose_database "$project")
  _dev_ok "Gerando migration $name..."
  if [ -n "$db" ]; then
    $rails_cmd g migration "$name" --database="$db"
  else
    $rails_cmd g migration "$name"
  fi
}