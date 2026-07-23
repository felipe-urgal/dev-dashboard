#!/usr/bin/env bash
# ============================================================
# ROUTES HELPERS — Menu e exibição de rotas
# ============================================================
_routes_menu_show() {
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Todas;Listar todas as rotas do projeto\n"
    rows+="Buscar;Filtrar rotas por termo (rails routes -g)\n"
    rows+="Controller;Rotas de um controller específico (rails routes -c)\n"
    rows+="Voltar;Voltar ao menu Rails\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Todas" "Buscar" "Controller" "Voltar")
    echo "Rotas:" >&2
    local i=1
    local opt
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha uma opção: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
      echo "${options[$((choice-1))]}"
    fi
  fi
}

# Executa rails routes com os argumentos dados e pagina a saída.
_routes_show() {
  local tmpfile
  tmpfile=$(mktemp) || { _dev_err "Não foi possível criar arquivo temporário."; return 1; }

  _dev_step "Carregando rotas (pode demorar na primeira vez)..."
  if ! _dev_run_rails routes "$@" > "$tmpfile" 2>&1; then
    _dev_err "Falha ao carregar rotas:"
    cat "$tmpfile" >&2
    rm -f "$tmpfile"
    _dev_pause
    return 1
  fi

  if [ ! -s "$tmpfile" ]; then
    _dev_warn "Nenhuma rota encontrada."
    rm -f "$tmpfile"
    _dev_pause
    return 1
  fi

  less "$tmpfile"
  rm -f "$tmpfile"
}
