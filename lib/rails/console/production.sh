#!/usr/bin/env bash
# ============================================================
# Console Production
# ============================================================
_console_production() {
  _dev_warn "ATENÇÃO: console de PRODUÇÃO!"

  local confirmed=false
  if _dev_has gum; then
    gum confirm "" --default=false --affirmative="Sim" --negative="Não" && confirmed=true
  else
    read -r -p "Tem certeza que deseja abrir o console em PRODUCTION? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && confirmed=true
  fi

  if ! $confirmed; then
    _dev_warn "Cancelado."
    _dev_pause
    return 1
  fi

  _dev_ok "Abrindo console Rails (production)..."
  local console_cmd
  if [ -f "bin/rails" ]; then
    console_cmd="bin/rails console -e production"
  else
    console_cmd="bundle exec rails console -e production"
  fi
  bash -c "$console_cmd"
  _dev_clear
}