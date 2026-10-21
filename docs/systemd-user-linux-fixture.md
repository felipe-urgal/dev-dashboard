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

The opt-in job uses `scripts/qualify-systemd-user-fixture.sh` and requires
`RUNNER_ENVIRONMENT=github-hosted`, Linux, systemd PID 1, and the non-root
`runner` account with an accessible user manager. GitHub-hosted runners are
**ephemeral VMs**, not shared operator hosts. Unlike the previous attempt to
create a new user, this gate does **not** call `sudo`, `useradd`,
`loginctl` or any system-scope systemctl command.

The script first validates `systemctl --user show-environment`, then runs
the opt-in test with a minimal environment and a bounded timeout. Only the
random user-unit fixture is created, started, restarted and stopped. The
test's own finally cleanup removes the unit file after checking its identity.
Even if the job fails or the process is killed, the entire hosted VM is
discarded. A missing user manager fails the job; it cannot count as
successful real-provider evidence. No application-level mutation route,
persisted production grant or system-scope delegation is enabled.

This job is deliberately selected by the PR title marker
`[systemd-fixture]`. The ordinary CI jobs and main-branch pushes do not run
it. A green result here validates the Linux fixture only, **not** complete
planner authorization or Activity/Jobs recovery.
