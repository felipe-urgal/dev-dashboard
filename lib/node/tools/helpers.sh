#!/usr/bin/env bash
# ============================================================
# NODE TOOLS HELPERS — Lint, build e typecheck
# ============================================================

# Encontra o primeiro script existente no package.json entre os candidatos.
_node_tools_find_script() {
  local candidate
  for candidate in "$@"; do
    if grep -q "\"$candidate\"" package.json 2>/dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

_node_tools_menu_show() {
  local lint_script="$1"
  local build_script="$2"
  local typecheck_script="$3"

  local -a options=()
  [ -n "$lint_script" ] && options+=("Lint")
  [ -n "$build_script" ] && options+=("Build")
  [ -n "$typecheck_script" ] && options+=("Typecheck")
  options+=("Voltar")

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    [ -n "$lint_script" ] && rows+="Lint;Verificar estilo do código ($lint_script)\n"
    [ -n "$build_script" ] && rows+="Build;Compilar o projeto ($build_script)\n"
    [ -n "$typecheck_script" ] && rows+="Typecheck;Verificar tipos ($typecheck_script)\n"
    rows+="Voltar;Voltar ao menu Node\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    echo "Ferramentas:" >&2
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

_node_tools_run() {
  local script="$1"
  local cmd
  cmd=$(_node_run_script "$script") || {
    _dev_err "Nenhum gerenciador de pacotes (pnpm/yarn/npm) disponível."
    return 1
  }

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ $cmd" >&2
  else
    echo "\$ $cmd" >&2
  fi
  echo >&2

  $cmd
  local ret=$?
  echo >&2
  if [ $ret -eq 0 ]; then
    _dev_ok "'$script' concluído sem erros."
  else
    _dev_err "'$script' falhou (código $ret)."
  fi
  return $ret
}
