#!/usr/bin/env bash
# ============================================================
# db:migrate
# ============================================================

_dev_db_migrate() {
  local rails_cmd="$1"
  _dev_spin "Executando migrações..." $rails_cmd db:migrate
}