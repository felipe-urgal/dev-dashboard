# Systemd confirmed lifecycle bridge (internal only)

The internal `SystemdConfirmedLifecycleRunner` adapts the coordinator's
`ConfirmedLifecycleRunner.run(action, node, confirmation)` boundary to the
existing `SystemdUserLifecycleService.run()` owner. It does **not** register an
executor in the application, a command endpoint, an Activity job, or a button.

The bridge rejects malformed or expired confirmations, mismatched actions,
unapproved/ambiguous nodes, system scope, Dashboard units, unsafe unit names,
non-exclusive bindings and contradictory runtime state. It requires a
`systemdCapability.status = supported` node **and** a verified
`willStart` / `willStop` disposition before delegation. The current planner
deliberately **never emits** that status: it reports `unknown` instead when
it sees a hypothetical supported capability. The current coordinator still
permits Compose-only nodes, while the actual user-unit authorizer still requires
`executable: true` from a separately confirmed current plan. Consequently
there is no executable path to systemd in production.

Once future safety gates are proven, the user-unit owner itself rechecks the
operator's persisted grant, matching project/environment/binding/revision and
plan hash, obtains the canonical `systemd:user:<unit>` resource lease, verifies
live unit observations and dispatches only fixed `systemctl --user` arguments.
The bridge refuses no-op or contradictory outcomes as a verified transition
and never asserts readiness based on the systemd active state alone.

The existing Activity step writer is extended to classify user-unit steps
under `security` / `systemd.user.confirmed-start|stop`, using a bounded
resource identity and fixed redacted summary. This is prepared for **future**
coordinator wiring; it is not a new operational audit record or durable job
by itself. The internal coordinator's existing Job journal must be supplied
before real mutation, and safe recovery/fencing plus disposable Linux user-unit
E2E are still required.

Unit tests inject a fake owner and Activity repository. They do not run
`systemctl` or alter host services. #1117 and #1116 remain open.
