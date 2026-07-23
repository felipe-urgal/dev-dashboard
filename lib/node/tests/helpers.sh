#!/usr/bin/env bash
# ============================================================
# NODE TESTS HELPERS — Scripts, menu, seleção de arquivos
# ============================================================
_node_tests_detect_scripts() {
  local has_test=false
  local has_coverage=false
  if grep -q '"test"' package.json 2>/dev/null; then
    has_test=true
  fi
  if grep -q '"test:coverage"' package.json 2>/dev/null; then
    has_coverage=true
  fi
  echo "$has_test|$has_coverage"
}

# Detecta o framework de testes do projeto (vitest, jest ou mocha).
_node_tests_detect_runner() {
  if grep -q '"vitest"' package.json 2>/dev/null || ls vitest.config.* &>/dev/null; then
    echo "vitest"
  elif grep -q '"jest"' package.json 2>/dev/null || ls jest.config.* &>/dev/null; then
    echo "jest"
  elif grep -q '"mocha"' package.json 2>/dev/null || ls .mocharc.* &>/dev/null; then
    echo "mocha"
  fi
}

_node_tests_list_files() {
  find . -type f \( -name "*.test.js" -o -name "*.spec.js" -o -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.jsx" -o -name "*.spec.jsx" -o -name "*.test.tsx" -o -name "*.spec.tsx" \) | sed 's|^\./||' | sort
}

_node_tests_select_file() {
  local -a files
  readarray -t files < <(_node_tests_list_files)
  if [ ${#files[@]} -eq 0 ]; then
    return 1
  fi

  if _dev_has gum; then
    printf '%s\n' "${files[@]}" | gum filter --placeholder "Digite para buscar um arquivo de teste..." --height 15
  else
    echo "Arquivos de teste disponíveis:" >&2
    local i=1
    local f
    for f in "${files[@]}"; do
      echo "  $i) $f" >&2
      ((i++))
    done
    echo "  $i) Voltar" >&2
    read -r -p "Número do arquivo: " choice
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -eq "$i" ]; then
      return 1
    fi
    if [ "$choice" -ge 1 ] && [ "$choice" -le ${#files[@]} ]; then
      echo "${files[$((choice-1))]}"
    fi
  fi
}

_node_tests_menu_show() {
  local has_test="$1"
  local has_coverage="$2"
  local pkg_manager="$3"
  local -a options=()
  $has_test && options+=("Test")
  $has_coverage && options+=("Coverage")
  options+=("Arquivo")
  options+=("Voltar")

  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    $has_test && rows+="Test;Executar todos os testes com $pkg_manager\n"
    $has_coverage && rows+="Coverage;Executar testes com relatório de cobertura\n"
    rows+="Arquivo;Executar um arquivo de teste específico\n"
    rows+="Voltar;Voltar ao menu Node\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -n "$selected" ] && echo "$selected" | cut -d';' -f1 | xargs
  else
    echo "Testes Node:" >&2
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

_node_tests_run_live() {
  local cmd="$1"
  shift
  local args="$*"

  echo "----------------------------------------" >&2
  echo "  Executando testes... (Ctrl+C para cancelar)" >&2
  echo "----------------------------------------" >&2
  echo >&2

  $cmd $args
  local exit_code=$?

  echo >&2
  echo "----------------------------------------" >&2
  if [ $exit_code -eq 0 ]; then
    _dev_ok "Testes concluídos sem falhas."
    echo "  Aguardando, irá fechar automaticamente em 3 segundos..." >&2
    sleep 3
  else
    _dev_err "Testes falharam (código $exit_code)."
    _dev_pause
  fi
  echo "----------------------------------------" >&2
  return $exit_code
}