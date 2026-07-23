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
_dev_run_rspec() {
  bundle exec rspec "$@"
}
_dev_run_rake() {
  bundle exec rake "$@"
}
_dev_run_sidekiq() {
  if [ -f "bin/sidekiq" ]; then
    bin/sidekiq "$@"
  else
    bundle exec sidekiq "$@"
  fi
}
_dev_run_yarn() {
  yarn "$@"
}