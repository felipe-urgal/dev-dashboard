#!/usr/bin/env bash
# ============================================================
# ENTRY — Ponto de entrada público do dashboard
# ============================================================
dev-tools() {
  if ! _dev_has gum; then
    _dev_warn "gum não está instalado. Usando interface textual básica."
    echo "Instale gum para uma experiência melhor: https://github.com/charmbracelet/gum" >&2
    echo >&2
  fi

  dev-clean

  local original_dir="$PWD"
  while true; do
    _dev_clear
    dev-dashboard

    local sair
    if _dev_has gum; then
      gum confirm "" --affirmative="Sim" --negative="Não" && sair="sim"
    else
      read -r -p "Deseja sair? (s/N) " answer
      [[ "$answer" =~ ^[Ss] ]] && sair="sim"
    fi

    if [ "$sair" = "sim" ]; then
      _dev_clear
      cd "$original_dir" || return 1
      break
    fi
  done
}