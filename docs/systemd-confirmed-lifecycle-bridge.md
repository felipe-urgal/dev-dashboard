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


## Internal single-unit confirmed coordinator (PR #1156)

The new `SystemdConfirmedLifecycleCoordinator` is an **unregistered internal**
service. No HTTP/UI route or runtime application composition is added. The
production planner still returns `executable:false`, and cannot reach
`journal.begin` or a systemd command through this coordinator.

For a **hypothetical future executable plan**, it accepts exactly one
exclusive, project-bound, persistent `systemd --user` service and no mixed
providers, runtime profiles or dependencies. It performs:

1. Validate the short-lived confirmation, preview, action capability and
   target. Acquire the environment lease; revalidate the entire plan.
2. Persist `begin` and `beforeStep` to mark `invoking` before dispatch.
   The systemd owner separately acquires the logical and physical unit
   leases, then rechecks the grant, plan and that durable intent. Do not nest
   unit leases in the coordinator, or it would conflict with its own owner.
3. Invoke the existing internal `SystemdConfirmedLifecycleRunner` and
   observe the service independently. A running unit with
   `readiness:unknown` proves a state transition, **not app readiness**.
4. Persist completed/failed/unverified step, append the sanitized
   `security/systemd.user.confirmed-start|stop` Activity event, and
   finalize the durable Job. Activity failure cannot cause command replay.
   Journal failures after invocation require manual recovery.

Interrupted and partial Jobs remain non-replayable and block the same unit,
even after rebinding to another project. There is **no automatic retry,
reattach, cancellation or release** in this increment.

Tests use a real temporary Job journal and resource lease state, the real
Activity step writer with fake event storage, and a fake owner. They assert
pre-dispatch journal ordering, completed and uncertain outcomes, audit
redaction, crash/orphan denial, stale plans and environment-lock conflicts.
No host systemd unit is modified in this PR. The Linux opt-in fixture remains
a separate qualification, and operational authorization / E2E recovery remain
pending in #1117.
