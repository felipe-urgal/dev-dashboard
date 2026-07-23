#!/usr/bin/env bash
# ============================================================
# Console Development
# ============================================================
_console_development() {
  _dev_ok "Abrindo console Rails (development)..."
  local console_cmd
  if [ -f "bin/rails" ]; then
    console_cmd="bin/rails console -e development"
  else
    console_cmd="bundle exec rails console -e development"
  fi
  bash -c "$console_cmd"
  _dev_clear
}