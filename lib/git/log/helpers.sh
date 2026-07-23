#!/usr/bin/env bash
# ============================================================
# LOG HELPERS — Listagem, seleção, exibição de detalhes
# ============================================================
_log_show_recent() {
  local count="$1"
  git log --oneline --graph --decorate --color=always -n "$count"
  echo
}

_log_get_commits() {
  local count="$1"
  git log --oneline --graph --decorate --color=never -n "$count" | while IFS= read -r line; do
    local hash=$(echo "$line" | sed -E 's/^[^a-f0-9]*([a-f0-9]+).*/\1/')
    [ -z "$hash" ] && continue
    echo "$hash|$line"
  done
}

_log_menu_show() {
  if _dev_has gum; then
    local rows="Ação;Descrição\n"
    rows+="Ver detalhes de um commit;Escolher um commit específico para inspecionar\n"
    rows+="Ver mais commits;Carregar mais 20 commits no histórico\n"
    rows+="Voltar;Sair da visualização\n"
    local selected
    selected=$(printf "%b" "$rows" | gum table \
      --separator=";" \
      --border="rounded" \
      --border.foreground="#7C3AED" \
      --header.foreground="#7C3AED")
    [ -z "$selected" ] && { echo "Voltar"; return; }
    echo "$selected" | cut -d';' -f1 | xargs
  else
    local -a options=("Ver detalhes de um commit" "Ver mais commits" "Voltar")
    local i=1
    for opt in "${options[@]}"; do
      echo "  $i) $opt" >&2
      ((i++))
    done
    read -r -p "Escolha: " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#options[@]} ]; then
      echo "${options[$((num-1))]}"
    else
      echo "Voltar"
    fi
  fi
}

_log_select_commit() {
  local all_commits="$1"
  local -a hashes=()
  local -a subjects=()
  while IFS='|' read -r hash subject; do
    hashes+=("$hash")
    subjects+=("$subject")
  done <<< "$all_commits"

  if [ ${#hashes[@]} -eq 0 ]; then
    _dev_warn "Nenhum commit disponível."
    return 1
  fi

  local selected_subject
  if _dev_has gum; then
    selected_subject=$(printf '%s\n' "${subjects[@]}" | gum filter --placeholder "Digite para buscar um commit..." --height 15)
  else
    echo "Commits disponíveis:" >&2
    local j=1
    for sub in "${subjects[@]}"; do
      echo "  $j) $sub" >&2
      ((j++))
    done
    read -r -p "Número do commit: " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#subjects[@]} ]; then
      selected_subject="${subjects[$((num-1))]}"
    fi
  fi

  if [ -z "$selected_subject" ]; then
    return 1
  fi

  local idx
  for idx in "${!subjects[@]}"; do
    if [ "${subjects[$idx]}" = "$selected_subject" ]; then
      echo "${hashes[$idx]}"
      return 0
    fi
  done
  return 1
}

_show_commit_detail() {
  local commit_hash="$1"

  _dev_clear
  _dev_breadcrumb "Git" "Ver commits" "Detalhe"
  echo >&2
  _dev_step "Detalhes do commit $commit_hash"
  echo >&2

  local cmd="git show --color=always $commit_hash"
  if _dev_has diff-so-fancy; then
    bash -c "$cmd" | diff-so-fancy | less -R
  elif _dev_has bat; then
    bash -c "$cmd" | bat --paging=always -l diff
  elif command -v less &>/dev/null; then
    bash -c "$cmd" | less -R
  else
    bash -c "$cmd"
  fi
  echo
  _dev_pause
}