#!/usr/bin/env bash
# ============================================================
# COMMIT HELPERS — Prefixo, input, perguntas
# ============================================================

# Obtém o prefixo convencional baseado na branch atual
_commit_prefix() {
  _git_branch_prefix
}

# Pergunta se deve usar --amend
_commit_ask_amend() {
  _dev_clear
  _dev_breadcrumb "Git" "Commit"
  echo >&2
  _dev_step "Deseja alterar o último commit ao invés de criar um novo?"
  echo >&2

  if _dev_has gum; then
    gum confirm "Usar --amend?" && echo "yes"
  else
    read -r -p "Usar --amend? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && echo "yes"
  fi
}

# Coleta a mensagem do usuário (com gum write ou editor)
_commit_get_message() {
  local amend="$1"

  _dev_clear
  _dev_breadcrumb "Git" "Commit" "Mensagem"
  echo >&2
  if [ "$amend" = "true" ]; then
    _dev_step "Digite a nova mensagem (ou deixe em branco para manter a mensagem atual)."
  else
    _dev_step "Descreva as alterações realizadas neste commit."
  fi
  echo >&2

  if _dev_has gum; then
    gum write --placeholder "Descreva as alterações..." --width 60 --height 5
  else
    local editor="${EDITOR:-}"
    [ -z "$editor" ] && { _dev_has nano && editor="nano" || editor="vim"; }

    if _dev_has gum; then
      gum style --foreground "#6B7280" --italic "Abrindo editor: $editor..." >&2
    else
      echo "Abrindo editor: $editor..." >&2
    fi
    sleep 1

    local tmpfile
    tmpfile=$(mktemp) || { _dev_err "Não foi possível criar arquivo temporário."; return 1; }
    cat > "$tmpfile" <<'EOF'
# Escreva a mensagem de commit. Salve e saia para confirmar.
# Linhas iniciadas com '#' serão ignoradas.
EOF
    "$editor" "$tmpfile"
    local msg
    msg=$(grep -v '^#' "$tmpfile" | sed '/^[[:space:]]*$/d')
    rm -f "$tmpfile"
    echo "$msg"
  fi
}

# Pergunta se deve adicionar todos os arquivos (git add .)
_commit_ask_add_all() {
  _dev_clear
  _dev_breadcrumb "Git" "Commit" "Arquivos"
  echo >&2
  _dev_step "Existem alterações não adicionadas ao stage."
  echo >&2

  if _dev_has gum; then
    gum confirm "Adicionar todas as alterações (git add .)?" && echo "yes"
  else
    read -r -p "Adicionar todas as alterações? (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && echo "yes"
  fi
}