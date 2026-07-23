#!/usr/bin/env bash
# ============================================================
# db:create
# ============================================================

_dev_db_create() {
  local rails_cmd="$1"
  _dev_spin "Criando banco..." $rails_cmd db:create
}