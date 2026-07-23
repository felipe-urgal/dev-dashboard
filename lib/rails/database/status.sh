#!/usr/bin/env bash
# ============================================================
# db:migrate:status
# ============================================================

_dev_db_status() {
  local rails_cmd="$1"
  _dev_spin "Verificando status..." $rails_cmd db:migrate:status
  _dev_pause
}