#!/usr/bin/env bash
# ============================================================
# Parar servidor Node
# ============================================================

_node_server_stop() {
  local project="$1"
  dev-stop "$project"
  sleep 3
}