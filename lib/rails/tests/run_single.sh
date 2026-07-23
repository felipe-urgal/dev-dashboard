#!/usr/bin/env bash
# ============================================================
# Executar arquivo único com repetição
# ============================================================
_tests_run_single() {
  local project="$1"
  local path="$2"
  local selected_file
  selected_file=$(_select_single_spec)
  if [ -z "$selected_file" ]; then
    _dev_warn "Cancelado."
    _dev_pause
    return 1
  fi

  while true; do
    _run_rspec_live "$selected_file"
    _dev_clear
    _dev_breadcrumb "Comandos Rails" "Testes" "Arquivo"
    echo >&2
    _dev_step "Último arquivo executado: $selected_file"
    echo >&2

    local repeat=false
    if _dev_has gum; then
      gum confirm "Executar novamente o mesmo arquivo?" --affirmative="Sim" --negative="Não" && repeat=true
    else
      read -r -p "Executar novamente? (s/N) " answer
      [[ "$answer" =~ ^[Ss] ]] && repeat=true
    fi

    if $repeat; then
      continue
    else
      break
    fi
  done
}