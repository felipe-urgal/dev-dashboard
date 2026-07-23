#!/usr/bin/env bash
# ============================================================
# db:seed
# ============================================================

_dev_db_seed() {
  local rails_cmd="$1"
  _dev_spin "Semeando banco..." $rails_cmd db:seed
}