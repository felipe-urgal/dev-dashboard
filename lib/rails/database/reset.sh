#!/usr/bin/env bash
# ============================================================
# db:reset
# ============================================================
_dev_db_reset() {
  local rails_cmd="$1"
  local confirmed=false

  if _dev_has gum; then
    gum confirm "Resetar o banco? (drop + create + migrate + seed)" --default=false --affirmative="Sim" --negative="Não" && confirmed=true
  else
    read -r -p "Tem certeza que deseja RESETAR o banco? (drop+create+migrate+seed) (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && confirmed=true
  fi

  if $confirmed; then
    _dev_spin "Resetando banco..." $rails_cmd db:reset
  else
    _dev_warn "Cancelado."
    _dev_pause
    return 1
  fi
}