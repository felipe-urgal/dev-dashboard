#!/usr/bin/env bash
# ============================================================
# dev-terminal — Abre um shell interativo no diretório do projeto
# ============================================================
dev-terminal() {
  local project="$1"
  local path
  path=$(project-path "$project") || path=""
  if [ -z "$path" ] || [ ! -d "$path" ]; then
    _dev_err "Caminho do projeto '$project' não encontrado."
    sleep 3
    return 1
  fi

  _dev_clear
  _dev_breadcrumb "$path" "$project" "Terminal"
  echo >&2
  _dev_step "Usando shell: ${SHELL:-bash}"
  _dev_step "Digite 'exit' ou pressione Ctrl+D para voltar ao dashboard."
  echo >&2

  local old_dir
  old_dir=$(pwd)
  cd "$path" || { _dev_err "Não foi possível acessar $path"; sleep 3; return 1; }

  "$SHELL"
  local shell_exit=$?

  cd "$old_dir" >/dev/null 2>&1
  echo >&2

  if [ $shell_exit -eq 0 ]; then
    _dev_ok "Voltando ao dashboard..."
  else
    _dev_warn "Shell encerrado com código $shell_exit. De volta ao dashboard."
  fi
  sleep 2
}