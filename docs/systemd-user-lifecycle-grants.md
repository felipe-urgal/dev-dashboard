# Operator-owned systemd user grants (internal, not enabled)

Issue #1117 introduces an opt-in, **read-only** local grant file and an internal authorizer. It is not registered in the application, has no HTTP mutation route, and **does not enable** Start/Stop/Restart in the UI. Discovery and service bindings are not grants.

The file path is supplied only by trusted server configuration to `SystemdUserLifecycleGrantPolicy`. No path comes from the browser. The default (no file) denies all permissions. The file must be a regular, non-symlink file owned by the Dashboard API's Unix user, mode 0600, one hard link, valid JSON and at most 64 KiB. It is reread for every authorization to reflect revocation without restart. Invalid, oversized, unknown-version, group-readable or unreadable files deny *every* grant. An operator must create/edit this file outside the browser; no grant management API or CLI is provided yet. Restrict access to the API account, and never store grant contents in a project repository.

Example (identifiers and SHA-256 hashes are illustrative and must be replaced with current backend-resolved values):

```json
{
  "version": 1,
  "grants": [
    {
      "projectId": "my-project-id",
      "environmentInstanceId": "environment:primary:my-project-id",
      "bindingId": "11111111-1111-4111-8111-111111111111",
      "serviceRef": "systemd:user:my-fixture.service",
      "bindingRevision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "actions": ["start", "stop"],
      "expiresAt": "2026-10-22T12:00:00.000Z"
    }
  ]
}
```

Grant records are exact, expiring, action-scoped and unique per project/environment/service. Neither unit names nor scope can be supplied as authority by the browser. The service must have exactly one enabled required binding in the same host environment, and **no other consumer binding**, including disabled consumers. Any change to project bindings invalidates the grant revision.

The authorizer recomputes the current plan and verifies the explicit approved planHash, revision, target, node, disposition and `executable === true`. Restart remains denied until it has its own confirmed plan. The current #1116 planner deliberately returns `executable: false`, so even a syntactically valid grant cannot execute systemd at this stage. A matching grant is only an additional authorization gate; it cannot override a blocked plan, unsupported provider or stale observation. The already-integrated user-unit adapter still checks unit identity, owner lease and observed runtime state immediately before dispatch.

Remaining safety gates: decide and implement trusted grant provisioning, production policy, capability exposure, cross-owner lease coordination, durable Jobs/Activity, recovery/timeout and disposable Linux user-unit E2E; connect only after they are tested. System scope stays read-only, and no host units or boot policy are touched by these tests.

## Durable pre-dispatch intent gate (#1117)

The internal `SystemdUserLifecycleAuthorizer` now denies a user-unit command
unless the **same** durable coordinator Job is present in its `invoking`
stage, with a matching in-flight unit, project, environment, action, binding
revision and `planHash`. It scans all Jobs for the physical unit and denies
ambiguous, interrupted, terminal partial or cross-project contenders, missing
storage, and stale (>30 seconds) intent. A Job merely `prepared` is **not**
authority to invoke anything. The actual caller must record
`journal.beforeStep(...)` before reaching the owner.

The independent planner gate also requires a fresh (30-second maximum)
`executable:true` plan with a single, correctly ordered `systemd --user`
unit whose **action-specific capability is explicitly supported**, with the
correct pre-action state and unknown readiness. A persisted operator grant
alone and a read-only preview are never sufficient. The current planner still
always returns `executable:false` and does not emit `supported`; none of
these stricter checks enable any real API/HTTP systemd mutation.

The authorizer is deliberately not registered in the app. This is a
future execution prerequisite, **not** permission to skip coordinator
journaling, grant revocation checks under the physical locks or proof of
recovery after interruption. Unit tests use fake plans and a real temporary
durable Job journal; no systemctl command is run.
