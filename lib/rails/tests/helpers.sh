#!/usr/bin/env bash
# ============================================================
# TESTS HELPERS — Execução RSpec e seleção de arquivos
# ============================================================
_run_rspec_live() {
  local spec_files="$1"
  local rspec_cmd="bundle exec rspec --color --format progress $spec_files"
  local start_time=$SECONDS

  if _dev_has gum; then
    gum spin --spinner dot --title "Executando testes..." --show-output -- bash -c "$rspec_cmd"
  else
    bash -c "$rspec_cmd"
  fi
  local exit_code=$?
  local elapsed=$((SECONDS - start_time))

  echo >&2
  if [ $exit_code -eq 0 ]; then
    _dev_ok "Testes concluídos em ${elapsed}s sem falhas."
    echo "  Aguardando, irá fechar automaticamente em 3 segundos..." >&2
    sleep 3
  else
    _dev_err "Testes falharam após ${elapsed}s (código $exit_code)."
    _dev_pause
  fi
  return $exit_code
}

_list_spec_files() {
  find . -name "*_spec.rb" -type f | sed 's|^\./||' | sort
}

_select_multiple_specs() {
  local -a specs
  readarray -t specs < <(_list_spec_files)
  if [ ${#specs[@]} -eq 0 ]; then
    return 1
  fi

  local files=""
  if _dev_has gum; then
    local selected
    selected=$(printf '%s\n' "${specs[@]}" | gum choose --no-limit --header "Selecione os arquivos (espaço para marcar, Enter confirma):" --height 20)
    if [ -n "$selected" ]; then
      files=$(echo "$selected" | tr '\n' ' ')
    fi
  else
    echo "Arquivos spec disponíveis:" >&2
    local k
    for k in "${!specs[@]}"; do
      echo "  $((k+1))) ${specs[$k]}" >&2
    done
    read -r -p "Digite os números dos arquivos (ex: 1,3,5) ou Enter para cancelar: " nums
    if [ -n "$nums" ]; then
      local -a selected_indices=()
      IFS=', ' read -r -a selected_indices <<< "$nums"
      local idx
      for idx in "${selected_indices[@]}"; do
        if [[ "$idx" =~ ^[0-9]+$ ]] && [ "$idx" -ge 1 ] && [ "$idx" -le ${#specs[@]} ]; then
          files="$files ${specs[$((idx-1))]}"
        fi
      done
    fi
  fi
  echo "$files" | xargs
}

_select_single_spec() {
  local -a specs
  readarray -t specs < <(_list_spec_files)
  if [ ${#specs[@]} -eq 0 ]; then
    return 1
  fi

  local selected_file=""
  if _dev_has gum; then
    selected_file=$(printf '%s\n' "${specs[@]}" | gum filter --placeholder "Digite para buscar um spec..." --height 15)
  else
    echo "Buscar spec (digite parte do nome ou Enter para listar todos):" >&2
    read -r search_term
    if [ -n "$search_term" ]; then
      local -a matches=()
      local spec
      for spec in "${specs[@]}"; do
        [[ "$spec" == *"$search_term"* ]] && matches+=("$spec")
      done
      if [ ${#matches[@]} -eq 1 ]; then
        selected_file="${matches[0]}"
      elif [ ${#matches[@]} -gt 1 ]; then
        echo "Múltiplas correspondências:" >&2
        local m
        for m in "${!matches[@]}"; do
          echo "  $((m+1))) ${matches[$m]}" >&2
        done
        read -r -p "Escolha o número: " num
        if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#matches[@]} ]; then
          selected_file="${matches[$((num-1))]}"
        fi
      else
        _dev_warn "Nenhuma correspondência para '$search_term'."
        return 1
      fi
    else
      local m
      for m in "${!specs[@]}"; do
        echo "  $((m+1))) ${specs[$m]}" >&2
      done
      read -r -p "Escolha o número: " num
      if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#specs[@]} ]; then
        selected_file="${specs[$((num-1))]}"
      fi
    fi
  fi
  echo "$selected_file"
}