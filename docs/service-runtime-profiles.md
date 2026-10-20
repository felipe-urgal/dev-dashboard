# Service Runtime Profiles (issue #1120)

A **Project** owns logical project metadata. A **Development Environment Instance**
identifies a specific primary checkout or worktree (and its host/devcontainer
runtime); it is not an environment selected by branch name. A **Stack** remains
a separate orchestration definition. A **Service Binding** references an exact
observed service in an environment and documents its relationship; it is not
permission to start or stop that service.

A **Service Runtime Profile** selects the IDs of existing enabled Service
Bindings for exactly one Project + Environment Instance. Its kind is
`dev`, `test` or `production`. Binding IDs are the only references
accepted; browser-provided host paths, commands, ports, database names and
systemd units cannot establish authority. Profiles for separate worktrees
are separate records even when their names are identical.

## Initial read/write API

Authenticated endpoints (all under `/api`):

- `GET /projects/:projectId/environments/:environmentInstanceId/service-profiles`
- `POST /projects/:projectId/environments/:environmentInstanceId/service-profiles`
- `PUT /projects/:projectId/environments/:environmentInstanceId/service-profiles/:profileId`
- `DELETE /projects/:projectId/environments/:environmentInstanceId/service-profiles/:profileId?expectedRevision=...`

POST/PUT accept `{ "kind": "test", "bindingIds": ["<binding UUID>"], "expectedRevision": "<profile revision>", "expectedBindingsRevision": "<binding revision>" }`.
Get both opaque revisions from GET; HTTP 409 on stale revisions,
nonexistent/disabled/foreign-environment bindings, or duplicate kinds in the
same environment. Profile data is stored in versioned, bounded
`service-runtime-profiles.json`; unknown versions fail closed, without
overwriting the original file. Deleting a Service Binding referenced by a
profile via its API is rejected until the profile is updated/removed.

## Semantics and limits

- With no configured profile for an instance, **no existing behavior changes**:
  the Dashboard, Stacks and Compose keep using their existing binding/config
  flow. Nothing is migrated or implicitly switched.
- Profiles are *declarative selection only*. GET/POST/PUT/DELETE never run
  Compose, systemd, processes, deploy, migrations or database commands.
- A change to an underlying binding can make the selected ID stale; GET
  exposes `staleBindingIds` and does not silently resolve by service name,
  port, branch or environment kind.
- Production profiles do not override the existing Production Contract,
  authorize deployment, grant secrets access or control real services.
- Read-only `GET /api/projects/:projectId/service-plan?action=start|stop`
  accepts optional `profileId=<saved UUID>` and an exact
  `environmentInstanceId`. A selected profile plans **only** its enabled
  binding IDs; stale/foreign IDs are rejected (409/404). Without `profileId`,
  the existing default planning behavior is unchanged.
- A selected profile cannot stop a service referenced by another runtime
  profile of the project: that service is `retained`. Sharing across projects
  and Environment Instances remains protected. Missing dependencies block
  Start rather than being adopted; an empty profile does not fall back to
  all bindings.
- The response includes the selected profile's ID, kind and revision. Its
  `planHash` tracks those along with binding revisions and runtime evidence.
  All plans remain `executable: false`; selecting `production` is only a view.
  A matching plan hash is never an authorization or execution ticket.
- The project Diagnosis panel now contains a Runtime Profiles selector and
  optional CRUD editor for existing enabled bindings. Its read-only Start/Stop
  simulation contrasts selected vs omitted services and displays observed
  ports, readiness, missing dependencies, sharing, unsupported actions and
  possible mutation risks. Switching profiles does not call lifecycle endpoints.
- The display compares ports only when two separate bindings declare the same
  descriptive role; names, ports, worktrees and production labels are never
  treated as evidence that two resources are interchangeable.
- The UI uses the existing profile and binding revisions on writes. It displays
  read-only errors instead of inferring safe state after partial observations.
  Deleting a profile has an explicit two-step confirmation and never deletes
  any service or binding.
- End-to-end qualification with real isolated worktrees and production policy
  restrictions remains pending in #1120.
- Storage follows the existing local, single-writer JSON-store model; it does
  not promise transactionality across multiple independently writing
  Dashboard processes.
