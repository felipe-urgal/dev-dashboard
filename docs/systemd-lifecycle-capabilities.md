# Systemd project capabilities (read-only)

`GET /api/projects/:projectId/systemd-capabilities?environmentInstanceId=...`
returns a **diagnostic snapshot**, authenticated with the existing local API
security. It accepts only a project id and an optional backend-known environment
instance id, and returns only systemd services **explicitly linked** to that
project/environment. It never resolves arbitrary user-supplied unit names or
accepts commands. Unlinked host services remain available only through
read-only inventory.

Each linked unit includes per-action `status` and a bounded, fixed `reason`:
- `unsupported`: system scope, non-Linux, invalid/self unit, untrusted unit
  metadata, disabled/non-required binding, shared resource, incompatible state,
  or the missing confirmed execution path.
- `unknown`: user inventory is partial, truncated, unavailable or stale.
- `permission-required`: a verified stopped/running user unit lacks a
  current operator grant for the action, binding and project revision.
- `supported` is reserved for a future end-to-end verified executor; **not
  emitted yet**.

The snapshot **always** reports `executable: false`; it is *not* an
authorization or proof of readiness. A grant does not override
`ServiceLifecyclePlanningService.executable: false`, and no new mutation
route, button, systemd service operation, boot change or elevation is added.

By default the app does not configure an operator grant policy path, so
permission-required is expected for otherwise eligible linked user units.
If trusted server bootstrap passes a policy path to `buildApp`, only that
server-selected path is read; callers cannot select a path through HTTP.
The future execution integration must independently validate grant, plan hash,
revision, live observation and locks, and must not treat this GET result as
authorization.

The service rejects observations older than 30 seconds or dated in the future, and handles unreadable operator policies without leaking raw errors. A partial user inventory remains `unknown` even if system-scope inventory is available. These checks are advisory only; any future executor must repeat validation at dispatch time.

This diagnostic endpoint does not close #1117 or #1116.
