#!/usr/bin/env bash
# ============================================================
# dev-terminal — Shell no Execution Context canônico do projeto
# ============================================================
dev-terminal() {
  local project="$1"

  if ! _dev_dashboard_api_available; then
    _dev_err "A API local do Dev Dashboard é necessária para abrir o Terminal."
    _dev_pause
    return 1
  fi

  if ! _runtime_terminal_supported "$project" "shell"; then
    _dev_err "O Terminal não está disponível no ambiente atual do projeto."
    _dev_pause
    return 1
  fi

  _dev_clear
  _dev_breadcrumb "" "$project" "Terminal"
  echo >&2
  _dev_step "Abrindo shell no Execution Context atual."
  _dev_step "Digite 'exit' ou pressione Ctrl+D para voltar ao dashboard."
  echo >&2

  _runtime_api terminal-open "$project" "shell"
  local shell_exit=$?

  echo >&2
  if [ "$shell_exit" -eq 0 ]; then
    _dev_ok "Voltando ao dashboard..."
  else
    _dev_warn "Terminal encerrado com código $shell_exit."
  fi
}
