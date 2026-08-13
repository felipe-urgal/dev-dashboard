#!/usr/bin/env bash
# ============================================================
# Controle de serviços auxiliares
# ============================================================
_dev_port_open() {
  local port="$1"
  command -v lsof >/dev/null && lsof -i ":$port" >/dev/null 2>&1
}

