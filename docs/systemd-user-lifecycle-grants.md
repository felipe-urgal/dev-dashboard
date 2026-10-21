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

The authorizer recomputes the current plan and verifies the explicit approved planHash, revision, target, node, disposition and `executable === true`. Restart remains denied until it has its own confirmed plan. The current #1116 planner deliberately returns `executable: false`, so even a syntactically valid grant cannot execute systemd at this stage. The already-integrated user-unit adapter still checks unit identity, owner lease and observed runtime state immediately before dispatch.

Remaining safety gates: decide and implement trusted grant provisioning, production policy, capability exposure, cross-owner lease coordination, durable Jobs/Activity, recovery/timeout and disposable Linux user-unit E2E; connect only after they are tested. System scope stays read-only, and no host units or boot policy are touched by these tests.
