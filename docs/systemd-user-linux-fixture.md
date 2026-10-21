# Disposable systemd --user Linux integration fixture (#1117)

This is an **explicitly opt-in** real-provider test, not a production execution
route. Run only in a dedicated disposable non-root Linux user account or VM with
an already operational systemd user manager. Do not run in a personal or
production Dashboard account.

Run:

    DD_SYSTEMD_USER_FIXTURE_E2E=1 npm run test:systemd-user-fixture --workspace=@dev-dashboard/api

Normal npm test and npm run check **skip the real systemd case**. A separate
CI job, **Disposable Systemd User Fixture**, runs only for pull requests whose
title explicitly contains `[systemd-fixture]`, using an ephemeral GitHub Linux
runner and a newly created disposable local user.
An opt-in run fails rather than skipping when the user manager is unavailable.
Only check the issue's Linux fixture E2E requirement after the opt-in job
successfully runs all real transitions (never from the three normal jobs).

The test creates exactly one random dd-fixture-UUID.service file in the
test account's systemd user unit directory, with a fixed /usr/bin/sleep
command. It uses systemctl --user daemon-reload to discover this file. It
does not enable/disable any unit, use sudo/system scope, or execute commands
against existing application services.

The test passes the production internal adapter a test-only grant valid for
that exact project, environment, unit and plan/revision. It verifies
authorization denial, Start and reobservation, idempotent Start, Restart
(including changed MainPID), revocation denial and Stop. All live
commands target only the randomly named fixture. Lease state lives in a
unique temporary directory. The adapter continues to report
readiness unknown even while the systemd unit is active.

Cleanup verifies the original FragmentPath and inode/device before
stopping or unlinking the fixture, then reloads the user manager.
An identity mismatch fails closed and requires manual inspection.
If forcibly terminated, the sleep process is bounded by 300 seconds but
its user-unit file/lease may require manual cleanup. Only empty directories
created by the test are removed.

The inventory provider uses actual systemctl --user output filtered to the
random unit (list-units, list-unit-files and show). The system-scope part of
this test inventory is intentionally empty: no system unit is queried, and
unrelated user units do not exhaust the inventory budget. This fixture does
not claim to qualify global service discovery under a crowded user manager. No unrelated service file is deleted.

IMPORTANT: systemctl --user daemon-reload is a user-manager configuration
reload, not a private sandbox by itself. Run this test only with a
dedicated disposable account/VM. GitHub CI validation of the skipped test
does not constitute evidence of a completed real Linux systemd integration
run. This fixture does not test the persisted operator policy, the
HTTP confirmation path, full Activity/Jobs recovery, or system scope.
The planner still returns executable:false and no systemd mutation endpoint
is exposed.

## Dedicated GitHub Actions qualification

The opt-in job uses `scripts/qualify-systemd-user-fixture.sh` and refuses
non-Linux runners or a host without systemd PID 1. It creates a random
non-root test account with `useradd`, starts only that account's user
manager with `loginctl enable-linger`, and checks its own DBus socket.
The Node fixture runs without elevated privileges, with a minimal,
explicitly scoped environment. The wrapper uses an EXIT trap to disable
lingering, terminate only the newly created test user and remove that
account. Its entire GitHub runner VM is ephemeral.

Because `loginctl` setup requires sudo and mutates local login-manager
state for this **new disposable account**, it is intentionally not part
of standard CI and must not run on operator machines. Test commands
themselves remain `systemctl --user` against only the random unit.
The job fails if user sessions cannot be created or the test fails;
there is no skip or acceptance-by-mock. No runner account is granted
a production systemd lifecycle permission.
