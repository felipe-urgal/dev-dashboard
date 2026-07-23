#!/usr/bin/env bash
# ============================================================
# db:prepare
# ============================================================

_dev_db_prepare() {
  local rails_cmd="$1"
  _dev_spin "Preparando banco..." $rails_cmd db:prepare
}