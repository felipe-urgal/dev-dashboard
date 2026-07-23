#!/usr/bin/env bash
# ============================================================
# Pausa interativa
# ============================================================
_dev_pause() {
  echo >&2
  if _dev_has gum; then
    gum input --placeholder "Pressione Enter para continuar..." >/dev/null 2>&2
  else
    read -r -p "Pressione Enter para continuar..."
  fi
}