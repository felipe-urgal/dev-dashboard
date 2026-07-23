#!/usr/bin/env bash
# ============================================================
# dev-rails-menu-assets — Menu principal de Assets
# ============================================================
dev-rails-menu-assets() {
  local project="$1"
  local path
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1

  if ! _dev_has yarn; then
    _dev_err "yarn não encontrado. Instale o yarn para usar esta opção."
    _dev_pause
    return 1
  fi

  while true; do
    _dev_clear
    _dev_breadcrumb "Comandos Rails" "Assets"
    echo >&2
    _dev_step "Compile ou monitore os assets do projeto."
    echo >&2

    local -a options=(
      "build:js"
      "build:css"
      "build:all"
      "watch:css"
      "assets:precompile (Rails)"
    )
    local -a descriptions=(
      "Compilar JavaScript (esbuild)"
      "Compilar CSS (sass + autoprefixer + webfonts)"
      "Compilar JS + CSS"
      "Monitorar SCSS e recompilar automaticamente"
      "Precompilar assets via Rails (RAILS_ENV=test)"
    )
    options+=("Voltar")
    descriptions+=("Voltar ao menu Rails")

    local action=""
    if _dev_has gum; then
      local rows="Ação;Descrição\n"
      local i
      for i in "${!options[@]}"; do
        rows+="${options[$i]};${descriptions[$i]}\n"
      done
      local selected
      selected=$(printf "%b" "$rows" | gum table \
        --separator=";" \
        --border="rounded" \
        --border.foreground="#7C3AED" \
        --header.foreground="#7C3AED")
      [ -n "$selected" ] && action=$(echo "$selected" | cut -d';' -f1 | xargs)
    else
      echo "Assets:" >&2
      local j
      for j in "${!options[@]}"; do
        echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
      done
      read -r -p "Escolha uma opção: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]]; then
        local idx=$((choice - 1))
        if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#options[@]} ]; then
          action="${options[$idx]}"
        fi
      fi
    fi

    [ -z "$action" ] || [ "$action" = "Voltar" ] && return 0

    case "$action" in
      "build:js")                  _assets_build_js ;;
      "build:css")                 _assets_build_css ;;
      "build:all")                 _assets_build_all ;;
      "watch:css")                 _assets_watch_css ;;
      "assets:precompile (Rails)") _assets_precompile ;;
    esac
    _dev_pause
  done
}