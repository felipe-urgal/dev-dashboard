#!/usr/bin/env bash
# ============================================================
# git-commit — Fluxo completo: amend, mensagem, add
# ============================================================
# Depende de:
#   core.sh                        (_dev_has, _dev_ok, _dev_err, _dev_warn, _dev_pause, _dev_spin)
#   lib/git/commit/helpers.sh      (_commit_*, etc.)
# ============================================================
git-commit() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    _dev_err "Não está em um repositório Git."
    sleep 3
    return 1
  fi

  # --- 1. Pergunta se é amend (mesmo commit) ou novo commit ---
  local amend=false
  [[ "$(_commit_ask_amend)" == "yes" ]] && amend=true

  # --- 2. Coleta a mensagem ---
  local message
  message=$(_commit_get_message "$amend")

  # --- 3. Valida mensagem ---
  if [ -z "$message" ] && ! $amend; then
    _dev_warn "Mensagem vazia. Commit cancelado."
    sleep 3
    return 0
  fi

  # --- 4. Prefixo automático baseado na branch ---
  local prefix
  prefix=$(_commit_prefix)
  local commit_msg=""
  if [ -n "$message" ]; then
    if [ -n "$prefix" ]; then
      commit_msg="${prefix}: ${message}"
    else
      commit_msg="$message"
    fi
  fi
  # Se amend sem mensagem, commit_msg fica vazio (será usado --no-edit)

  # --- 5. Adicionar arquivos? ---
  local add_all=false
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    [[ "$(_commit_ask_add_all)" == "yes" ]] && add_all=true
  fi

  # --- 6. Executa add e commit ---
  _dev_clear
  _dev_breadcrumb "Git" "Commit" "Executando"
  echo >&2

  if $add_all; then
    if _dev_has gum; then
      gum style --foreground "#6B7280" --italic "\$ git add ." >&2
    else
      echo "\$ git add ." >&2
    fi
    _dev_spin "Adicionando arquivos..." git add .
  fi

  local -a commit_opts=()
  if [ -n "$commit_msg" ]; then
    commit_opts+=(-m "$commit_msg")
  fi
  if $amend; then
    commit_opts+=(--amend)
    [ -z "$commit_msg" ] && commit_opts+=(--no-edit)
  fi

  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ git commit ${commit_opts[*]}" >&2
  else
    echo "\$ git commit ${commit_opts[*]}" >&2
  fi

  _dev_spin "Commit em andamento..." git commit "${commit_opts[@]}"
  local ret=$?
  if [ $ret -eq 0 ]; then
    if $amend; then
      _dev_ok "Commit amendado com sucesso."
      _dev_warn "Lembre-se: histórico reescrito. Cuidado se já fez push."
    else
      _dev_ok "Commit realizado: ${commit_msg:-sem mensagem}"
    fi
  else
    _dev_err "Falha ao realizar commit (código $ret)."
  fi
  sleep 3
  return $ret
}