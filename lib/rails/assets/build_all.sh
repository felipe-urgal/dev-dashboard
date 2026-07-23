#!/usr/bin/env bash
# ============================================================
# build_all
# ============================================================

_assets_build_all() {
  _dev_spin "Compilando JS + CSS..." yarn build:all
}