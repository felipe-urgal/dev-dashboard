#!/usr/bin/env bash
# ============================================================
# watch_css
# ============================================================
_assets_watch_css() {
  _dev_ok "Iniciando watch de CSS (Ctrl+C para parar)..."
  yarn watch:css
  _dev_clear
}