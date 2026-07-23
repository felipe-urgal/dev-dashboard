#!/usr/bin/env bash
# ============================================================
# Console Test
# ============================================================
_console_test() {
  _dev_ok "Abrindo console Rails (test)..."
  local console_cmd
  if [ -f "bin/rails" ]; then
    console_cmd="bin/rails console -e test"
  else
    console_cmd="bundle exec rails console -e test"
  fi
  bash -c "$console_cmd"
  _dev_clear
}