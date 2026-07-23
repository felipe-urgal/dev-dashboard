#!/usr/bin/env bash
# ============================================================
# UNDO HELPERS — Listagem, seleção, confirmação, restauração
# ============================================================

_undo_get_files() {
  # Extrai status (2 chars) e nome do arquivo de forma confiável
  git status --porcelain | sed -n 's/^\(..\) \(.*\)$/\1|\2/p'
}

_undo_select_files() {
  local all_files="$1"
  local -a entries=()

  while IFS='|' read -r st name; do
    [ -n "$name" ] && entries+=("$st|$name")
  done <<< "$all_files"

  if [ ${#entries[@]} -eq 0 ]; then
    return 1
  fi

  echo >&2
  echo "Selecione os arquivos que deseja restaurar (as alterações serão perdidas):" >&2
  echo >&2

  local -a selected_entries=()

  if _dev_has gum; then
    local -a options=()

    # Cria opções com índice para evitar problemas de parsing
    for i in "${!entries[@]}"; do
      local st="${entries[$i]%%|*}"
      local name="${entries[$i]#*|}"
      options+=("$i|[$st] $name")
    done

    local selected_raw
    selected_raw=$(
      printf '%s\n' "${options[@]}" |
        gum choose \
          --no-limit \
          --header "Espaço para marcar, Enter confirma:"
    )

    [ -z "$selected_raw" ] && return 1

    while IFS= read -r line; do
      [ -z "$line" ] && continue

      local idx="${line%%|*}"

      if [[ "$idx" =~ ^[0-9]+$ ]]; then
        selected_entries+=("${entries[$idx]}")
      fi
    done <<< "$selected_raw"

  else
    echo "Arquivos modificados:" >&2

    local idx=1
    for entry in "${entries[@]}"; do
      local st="${entry%%|*}"
      local name="${entry#*|}"

      echo "  $idx) [$st] $name" >&2
      ((idx++))
    done

    echo >&2

    read -r -p \
      "Digite os números dos arquivos a desfazer (ex: 1,3,5) ou 'all' para todos, ou Enter para cancelar: " \
      choice

    [ -z "$choice" ] && return 1

    if [ "$choice" = "all" ]; then
      selected_entries=("${entries[@]}")
    else
      local -a nums=()
      IFS=', ' read -r -a nums <<< "$choice"

      for num in "${nums[@]}"; do
        if [[ "$num" =~ ^[0-9]+$ ]] &&
           [ "$num" -ge 1 ] &&
           [ "$num" -le ${#entries[@]} ]; then
          selected_entries+=("${entries[$((num-1))]}")
        fi
      done
    fi
  fi

  [ ${#selected_entries[@]} -eq 0 ] && return 1

  printf '%s\n' "${selected_entries[@]}"
}

_undo_confirm_restore() {
  local -a entries=("$@")
  echo >&2
  echo "Os arquivos abaixo terão suas alterações descartadas permanentemente:" >&2
  echo >&2
  for entry in "${entries[@]}"; do
    local name="${entry#*|}"
    echo "  - $name" >&2
  done
  echo >&2

  if _dev_has gum; then
    gum confirm "" --default=false --affirmative="Sim" --negative="Não" && return 0
  else
    read -r -p "Confirma a restauração? (s/N) " confirm
    [[ "$confirm" =~ ^[Ss] ]] && return 0
  fi
  return 1
}

_undo_restore_files() {
  local -a entries=("$@")
  local undone=0 failed=0

  for entry in "${entries[@]}"; do
    local st="${entry%%|*}"
    local file="${entry#*|}"

    # Se o status está vazio, tenta deduzir (raro)
    if [ -z "$st" ]; then
      if git ls-files --error-unmatch "$file" &>/dev/null; then
        st=" M"
      else
        st="??"
      fi
    fi

    case "$st" in
      "??")
        # Arquivo NÃO rastreado → remover
        if rm -f "$file" 2>/dev/null; then
          _dev_ok "Removido: $file (não rastreado)"
          ((undone++))
        else
          _dev_err "Falha ao remover: $file"
          ((failed++))
        fi
        ;;
      *)
        # Arquivo rastreado → restaurar para o HEAD
        if git checkout HEAD -- "$file" 2>/dev/null; then
          _dev_ok "Desfeito: $file"
          ((undone++))
        else
          # Última tentativa: se falhar, pode ser que o arquivo não exista no HEAD
          if rm -f "$file" 2>/dev/null; then
            _dev_ok "Removido: $file (fallback)"
            ((undone++))
          else
            _dev_err "Falha ao desfazer: $file"
            _dev_warn "Detalhes: $(git checkout HEAD -- "$file" 2>&1 | head -n1)"
            ((failed++))
          fi
        fi
        ;;
    esac
  done

  if [ $failed -eq 0 ]; then
    _dev_ok "Todos os $undone arquivo(s) restaurados com sucesso."
  else
    _dev_warn "$undone arquivo(s) restaurados, $failed falha(s)."
  fi
}