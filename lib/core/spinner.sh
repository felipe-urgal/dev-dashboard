#!/usr/bin/env bash
# ============================================================
# Spinner com gum (ou execução direta se gum ausente)
# ============================================================
# Uso: _dev_spin "Título" comando arg1 arg2 ...
# Exemplo: _dev_spin "Instalando gems" bundle install
# ============================================================
_dev_spin() {
  local title="$1"
  shift
  local temp_file
  temp_file=$(mktemp)

  if _dev_has gum; then
    gum spin --spinner dot --title "$title" -- bash -c '"$@" > "$0" 2>&1' "$temp_file" "$@"
  else
    echo "[$title]" >&2
    "$@" > "$temp_file" 2>&1
  fi
  local exit_code=$?

  if [ -s "$temp_file" ]; then
    cat "$temp_file"
    echo
  fi
  rm -f "$temp_file"

  if [ $exit_code -eq 0 ]; then
    _dev_ok "Comando concluído com sucesso."
    sleep 4
  else
    _dev_err "Comando falhou com código $exit_code."
    sleep 4
    return $exit_code
  fi
}