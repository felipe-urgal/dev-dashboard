# Disposable systemd --user Linux integration fixture (#1117)

This is an **explicitly opt-in** real-provider test, not a production execution
route. Run only in a dedicated disposable non-root Linux user account or VM with
an already operational systemd user manager. Do not run in a personal or
production Dashboard account.

Run:

    DD_SYSTEMD_USER_FIXTURE_E2E=1 npm run test:systemd-user-fixture --workspace=@dev-dashboard/api

Normal npm test, npm run check and GitHub CI **skip the real systemd case**.
An opt-in run fails rather than skipping when the user manager is unavailable.
Only record the issue's Linux integration E2E checkbox as complete after a
separately verified successful opt-in run, not after ordinary CI passes.

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
created by the test are removed. No unrelated service file is deleted.

IMPORTANT: systemctl --user daemon-reload is a user-manager configuration
reload, not a private sandbox by itself. Run this test only with a
dedicated disposable account/VM. GitHub CI validation of the skipped test
does not constitute evidence of a completed real Linux systemd integration
run. This fixture does not test the persisted operator policy, the
HTTP confirmation path, full Activity/Jobs recovery, or system scope.
The planner still returns executable:false and no systemd mutation endpoint
is exposed.
