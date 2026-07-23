#!/usr/bin/env bash
# ============================================================
# Helpers de verificação
# ============================================================

_dev_has() { command -v "$1" >/dev/null 2>&1; }

_dev_os() {
  case "$(uname -s)" in
    Darwin) echo "mac" ;;
    Linux)  echo "linux" ;;
    *)      echo "other" ;;
  esac
}