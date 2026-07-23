#!/usr/bin/env bash
# ============================================================
# Destroy Generator
# ============================================================
_generators_destroy() {
  local rails_cmd="$1"
  local target=""
  if _dev_has gum; then
    target=$(gum input --header "O que deseja destruir? (ex: model User):" --placeholder "model User")
  else
    read -r -p "Destruir (ex: model User): " target
  fi
  [ -z "$target" ] && return

  local confirmed=false
  if _dev_has gum; then
    gum confirm "Destruir '$target'?" --default=false --affirmative="Sim" --negative="Não" && confirmed=true
  else
    read -r -p "Tem certeza que deseja DESTRUIR '$target'? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && confirmed=true
  fi

  if $confirmed; then
    _dev_warn "Destruindo $target..."
    $rails_cmd d $target
  else
    _dev_warn "Cancelado."
  fi
}