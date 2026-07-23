#!/usr/bin/env bash
# ============================================================
# Logging (com fallback se gum não existir)
# ============================================================
_dev_err() {
  if _dev_has gum; then
    gum style --foreground="#EF4444" "$1" >&2
  else
    echo "$1" >&2
  fi
}
_dev_ok() {
  if _dev_has gum; then
    gum style --foreground="#22C55E" "$1" >&2
  else
    echo "$1" >&2
  fi
}
_dev_warn() {
  if _dev_has gum; then
    gum style --foreground="#F59E0B" "$1" >&2
  else
    echo "$1" >&2
  fi
}