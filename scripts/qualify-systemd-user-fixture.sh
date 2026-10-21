#!/usr/bin/env bash
# A dedicated GitHub-hosted ephemeral VM is the isolation boundary.
# This job does not create users, elevate privileges or touch system units.
set -Eeuo pipefail

if [[ "${GITHUB_ACTIONS:-}" != 'true' ||
      "${RUNNER_OS:-}" != 'Linux' ||
      "${RUNNER_ENVIRONMENT:-}" != 'github-hosted' ||
      -z "${RUNNER_TEMP:-}" ||
      "$(ps -p 1 -o comm= | tr -d ' ')" != 'systemd' ]]; then
  echo 'Requires a disposable GitHub-hosted Linux runner with systemd PID 1.' >&2
  exit 1
fi
if [[ "$(id -u)" == 0 ||
      "$(id -un)" != 'runner' ||
      "${HOME:-}" != '/home/runner' ]]; then
  echo 'Fixture may run only as the non-root user of the dedicated VM.' >&2
  exit 1
fi

runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [[ ! -d "$runtime_dir" ]]; then
  echo 'Ephemeral runner has no user runtime directory.' >&2
  exit 1
fi

# Prove user-manager access before any fixture file is created. Failure is
# not an authorized reason to skip the opt-in qualification.
test_env=(
  "HOME=$HOME"
  "USER=runner"
  "LOGNAME=runner"
  "PATH=$PATH"
  "XDG_RUNTIME_DIR=$runtime_dir"
  "DD_SYSTEMD_USER_FIXTURE_E2E=1"
)
if ! env -i "${test_env[@]}" \
  timeout 10s systemctl --user show-environment >/dev/null 2>&1; then
  echo 'GitHub-hosted runner user manager is not available.' >&2
  exit 1
fi

env -i "${test_env[@]}" \
  timeout --signal=TERM --kill-after=10s 105s \
  npm run test:systemd-user-fixture --workspace=@dev-dashboard/api

echo 'Real disposable systemd user-unit transitions verified on the ephemeral runner.'
