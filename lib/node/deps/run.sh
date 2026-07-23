#!/usr/bin/env bash
# ============================================================
# dev-node-menu-deps — Gerenciar dependências do projeto Node
# ============================================================
dev-node-menu-deps() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  local pkg
  pkg=$(_node_pkg_manager) || {
    _dev_err "Nenhum gerenciador de pacotes (pnpm/yarn/npm) disponível."
    sleep 3
    return 1
  }

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Node" "Dependências"
    echo >&2
    _dev_step "Gerenciador detectado: $pkg"
    echo >&2

    local action
    action=$(_node_deps_menu_show "$pkg")
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Instalar")
        _dev_spin "Instalando dependências..." bash -c "$pkg install"
        [ $? -eq 0 ] && _dev_ok "Dependências instaladas." || _dev_err "Falha ao instalar dependências."
        _dev_pause
        ;;
      "Atualizar")
        local update_cmd
        update_cmd=$(_node_deps_update_cmd "$pkg")
        _dev_spin "Atualizando dependências..." bash -c "$update_cmd"
        [ $? -eq 0 ] && _dev_ok "Dependências atualizadas." || _dev_err "Falha ao atualizar dependências."
        _dev_pause
        ;;
      "Reinstalar")
        local confirm=""
        if _dev_has gum; then
          gum confirm "Remover node_modules e reinstalar tudo?" --default=false --affirmative="Sim" --negative="Não" && confirm="yes"
        else
          read -r -p "Remover node_modules e reinstalar tudo? (s/N) " answer
          [[ "$answer" =~ ^[Ss] ]] && confirm="yes"
        fi
        if [ "$confirm" = "yes" ]; then
          _dev_spin "Removendo node_modules..." rm -rf node_modules
          _dev_spin "Reinstalando dependências..." bash -c "$pkg install"
          [ $? -eq 0 ] && _dev_ok "Reinstalação concluída." || _dev_err "Falha na reinstalação."
        else
          _dev_warn "Operação cancelada."
        fi
        _dev_pause
        ;;
    esac
  done
}
