# Systemd user lifecycle (internal adapter)

The `SystemdUserLifecycleService` is an **internal, not yet wired** building block for [#1117](https://github.com/felipe-urgal/dev-dashboard/issues/1117). It does not expose an HTTP endpoint or make entries in the service catalog executable. Discovery and service bindings remain read-only and do not confer management rights.

## Supported boundary

- Linux `systemd --user` only, for canonical `systemd:user:<name>.service` identities previously resolved by the backend.
- Explicit **server-side** authorization is required on each invocation and rechecked immediately before dispatch. The caller must verify the current project/environment ownership, a separately granted lifecycle permission and the `expectedRevision`/`planHash`. Passing a binding, observing a service or supplying a correctly shaped hash does **not** satisfy this contract.
- Requires **both** the physical `systemd:user:<unit>` and logical `resource:systemd:user:<unit>` leases, acquired atomically with `ServiceResourceOperationLock`. Ownership is rechecked before dispatch. For cross-process coordination, use the same shared local state directory. External systemctl calls do not cooperate.
- Only fixed `systemctl --user start|stop|restart -- <unit>` argv is used. No shell, sudo or arbitrary arguments. Time and output are bounded, and raw process errors are never returned to callers.
- Requires a complete observation of the user scope, stable unit identity, a persistent regular/instance unit, and a verified running/stopped state. It rejects unknown, transitional, masked, generated, transient, template, runtime-only and Dashboard units.
- Observes again before and after dispatch. A changed identity, failed command or ambiguous result fails closed; a prior mutation **may already have occurred** and must be reconciled. A running unit is **not** automatically healthy/ready.
- `stop` does not disable boot and `start` does not enable boot. Enable/disable belongs to #1121.

The systemd owner reserves both keys until the command has returned and the unit has been reobserved. A future coordinator must not nest its own `resource:` lease around this owner, or it would conflict with itself; it may retain the environment lease. Recovery evidence inspects both keys. No external `systemctl` operation is fenced.

## Integration gate — still pending

Do **not** wire this adapter to public routes or buttons until #1117/#1116 implement a persisted, explicit grant and enforce a fresh, confirmed lifecycle plan, current binding/ownership, conflict handling, durable audit, independent consumers, and cancellation/recovery guarantees. The planner currently sets `executable: false` intentionally. System units must stay **read-only** unless a separate, narrowly delegated authorization mechanism is designed and proven.

Tests in `apps/api/test/systemd-user-lifecycle-service.test.ts` use only fake inventory, lease and command runners. They do not operate on the host systemd or boot configuration. A disposable user-unit Linux integration fixture and end-to-end planner/Activity integration remain outstanding.

## Prepared coordinator bridge (PR #1150)

The internal `SystemdConfirmedLifecycleRunner` translates the confirmed
coordinator's planned node and confirmation into an owner request. It validates
the canonical user-unit identity, exclusive required binding, action-specific
disposition, fresh confirmation and a future `supported` capability before
delegating. Activity now has a provider-specific sanitized classification for
user-unit steps. See `docs/systemd-confirmed-lifecycle-bridge.md`.

**There is still no runtime registration or HTTP mutation endpoint.** The
current planner never emits a supported systemd node, the coordinator remains
Compose-only and the user-unit authorizer requires a separately executable
plan. The new bridge cannot start or stop real units in this application.
