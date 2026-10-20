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
- This increment does **not** yet connect profile selection to the UI or
  #1116's planner. Profile-specific differential previews and explicit
  confirmation are separate work still required by #1120.
- Storage follows the existing local, single-writer JSON-store model; it does
  not promise transactionality across multiple independently writing
  Dashboard processes.
