#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-bundler — Gerenciar gems do projeto
# ============================================================
dev-rails-menu-bundler() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  if ! _dev_has bundle; then
    _dev_err "Bundler não encontrado. Instale com: gem install bundler"
    sleep 3
    return 1
  fi

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Rails" "Bundler"
    echo >&2
    _dev_step "Gerencie as gems do projeto."
    echo >&2

    local action
    action=$(_bundler_menu_show)
    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "Instalar")
        _dev_spin "Instalando gems..." bundle install
        [ $? -eq 0 ] && _dev_ok "Gems instaladas." || _dev_err "Falha ao instalar gems."
        _dev_pause
        ;;
      "Atualizar")
        local confirm=""
        if _dev_has gum; then
          gum confirm "Atualizar todas as gems (bundle update)?" --default=false --affirmative="Sim" --negative="Não" && confirm="yes"
        else
          read -r -p "Atualizar todas as gems? (s/N) " answer
          [[ "$answer" =~ ^[Ss] ]] && confirm="yes"
        fi
        if [ "$confirm" = "yes" ]; then
          _dev_spin "Atualizando gems..." bundle update
          [ $? -eq 0 ] && _dev_ok "Gems atualizadas." || _dev_err "Falha ao atualizar gems."
        else
          _dev_warn "Operação cancelada."
        fi
        _dev_pause
        ;;
      "Outdated")
        _dev_step "Gems desatualizadas:"
        echo >&2
        bundle outdated
        _dev_pause
        ;;
    esac
  done
}
