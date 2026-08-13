#!/usr/bin/env bash
# ============================================================
# Runners (bin/rails, rspec, etc.)
# ============================================================
_dev_run_rails() {
  if [ -f "bin/rails" ]; then
    bin/rails "$@"
  else
    rails "$@"
  fi
}
