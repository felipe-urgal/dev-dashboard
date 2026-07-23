#!/usr/bin/env bash
# ============================================================
# assets_precompile (Rails)
# ============================================================
_assets_precompile() {
  local rails_cmd=""
  if [ -f "bin/rails" ]; then
    rails_cmd="bin/rails"
  else
    rails_cmd="bundle exec rails"
  fi
  _dev_spin "Precompilando assets (test)..." bash -c "RAILS_ENV=test $rails_cmd assets:precompile"
}