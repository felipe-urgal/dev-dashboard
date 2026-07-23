#!/usr/bin/env bash
# ============================================================
# dev-node-menu-scripts — Executar scripts do package.json
# ============================================================
dev-node-menu-scripts() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Node" "Scripts"
    echo >&2
    _dev_step "Selecione um script do package.json para executar."
    echo >&2

    local script
    script=$(_node_select_script)
    [ -z "$script" ] && return 0

    local cmd
    cmd=$(_node_run_script "$script") || {
      _dev_err "Nenhum gerenciador de pacotes (pnpm/yarn/npm) disponível."
      sleep 3
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
      _dev_ok "Script '$script' concluído."
    else
      _dev_err "Script '$script' falhou (código $ret)."
    fi
    _dev_pause
  done
}
