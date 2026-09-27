#!/usr/bin/env bash
# ============================================================
# Helpers de verificação
# ============================================================

_dev_has() {
  if [ "$1" = "gum" ] && [ "${DEV_DASHBOARD_DISABLE_GUM:-0}" = "1" ]; then
    return 1
  fi
  command -v "$1" >/dev/null 2>&1
}

_dev_os() {
  case "$(uname -s)" in
    Darwin) echo "mac" ;;
    Linux)  echo "linux" ;;
    *)      echo "other" ;;
  esac
}