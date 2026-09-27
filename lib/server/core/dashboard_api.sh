#!/usr/bin/env bash
# ============================================================
# DASHBOARD API — Ponte da TUI para os contratos HTTP canônicos
# ============================================================

_dev_dashboard_api() {
  node "$DEV_DASHBOARD_DIR/scripts/terminal-dashboard-api.mjs" "$@"
}

_dev_dashboard_api_available() {
  _dev_dashboard_api ping >/dev/null 2>&1
}

_dev_dashboard_snapshot() {
  _dev_dashboard_api snapshot
}

_dev_dashboard_project_record() {
  _dev_dashboard_api resolve "$1"
}

_dev_dashboard_start() {
  _dev_dashboard_api start "$1"
}

_dev_dashboard_stop() {
  _dev_dashboard_api stop "$1"
}

_dev_dashboard_start_all() {
  _dev_dashboard_api start-all
}

_dev_dashboard_stop_all() {
  _dev_dashboard_api stop-all
}

_dev_runtime_status_symbol() {
  case "$1" in
    running)  printf '🟢' ;;
    starting) printf '🟡' ;;
    stopping) printf '🟠' ;;
    failed)   printf '🔴' ;;
    stopped)  printf '⚪' ;;
    *)        printf '❔' ;;
  esac
}

_dev_runtime_status_label() {
  case "$1" in
    running)  printf 'running' ;;
    starting) printf 'starting' ;;
    stopping) printf 'stopping' ;;
    failed)   printf 'failed' ;;
    stopped)  printf 'stopped' ;;
    *)        printf 'unknown' ;;
  esac
}
