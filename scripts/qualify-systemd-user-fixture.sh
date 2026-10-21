#!/usr/bin/env bash
# Only for the optional GitHub-hosted Linux systemd fixture job.
# No existing user or application service may be operated by this script.
set -Eeuo pipefail

if [[ "${GITHUB_ACTIONS:-}" != 'true' || "${RUNNER_OS:-}" != 'Linux' ||
      -z "${RUNNER_TEMP:-}" || "$(ps -p 1 -o comm= | tr -d ' ')" != 'systemd' ]]; then
  echo 'Requires an ephemeral GitHub-hosted Linux runner with systemd PID 1.' >&2
  exit 1
fi
sudo -n true
if ! command -v loginctl >/dev/null || ! command -v useradd >/dev/null; then
  echo 'Linux login manager and local user creation are required.' >&2
  exit 1
fi

# Random, newly created account; it has no preexisting user manager units.
name="ddfixture-$(od -vN4 -An -tx1 /dev/urandom | tr -d '[:space:]')"
created=0
cleanup() {
  result=$?
  trap - EXIT
  if [[ $created == 1 ]]; then
    # Never target the runner's own user or another account.
    sudo -n loginctl disable-linger "$name" || true
    sudo -n loginctl terminate-user "$name" || true
    sudo -n userdel -r "$name" || true
  fi
  exit "$result"
}
trap cleanup EXIT

sudo -n useradd -m -s /bin/bash -- "$name"
created=1
uid="$(id -u "$name")"
home="$(getent passwd "$name" | cut -d: -f6)"
if [[ "$home" != "/home/$name" || ! "$uid" =~ ^[0-9]+$ ]]; then
  echo 'Unexpected fixture user identity.' >&2
  exit 1
fi

sudo -n loginctl enable-linger "$name"
# Report only manager metadata for this new disposable UID.
sudo -n loginctl show-user "$name" --property=Linger,State,RuntimePath || true
sudo -n systemctl show "user@$uid.service" \
  --property=LoadState,ActiveState,SubState,Result || true
bus="/run/user/$uid/bus"
test_env=(
  "HOME=$home"
  "USER=$name"
  "LOGNAME=$name"
  "PATH=$PATH"
  "XDG_RUNTIME_DIR=/run/user/$uid"
  "DBUS_SESSION_BUS_ADDRESS=unix:path=$bus"
  "DD_SYSTEMD_USER_FIXTURE_E2E=1"
)

# The manager must really be running; never treat missing DBus as a skip.
ready=0
for _ in $(seq 1 25); do
  if [[ -S "$bus" ]] &&
    sudo -n -u "$name" env -i "${test_env[@]}" systemctl --user show-environment >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ $ready != 1 ]]; then
  echo 'Dedicated systemd --user manager did not become available.' >&2
  sudo -n loginctl show-user "$name" --property=Linger,State,RuntimePath || true
  sudo -n systemctl show "user@$uid.service" \
    --property=LoadState,ActiveState,SubState,Result || true
  if [[ -S "$bus" ]]; then
    echo 'User bus socket exists; connection failed.' >&2
  else
    echo 'User bus socket is absent.' >&2
  fi
  exit 1
fi

# Only the checkout/installed code may be read, never written by the test user.
if ! sudo -n -u "$name" test -r "$PWD/apps/api/test/systemd-user-lifecycle-linux-fixture.test.ts"; then
  echo 'Fixture test source is not readable by the disposable account.' >&2
  exit 1
fi

# npm workspace executes one explicit opt-in test; no CI-wide DD_* flag.
sudo -n -u "$name" env -i "${test_env[@]}" \
  timeout --signal=TERM --kill-after=10s 105s \
  npm run test:systemd-user-fixture --workspace=@dev-dashboard/api

echo 'Disposable systemd user-unit test passed in a dedicated user manager.'
