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

## Using the project panel

Open a project, choose **Diagnóstico**, then **Perfis de serviços do ambiente**.
Choose `Padrão` to preview all enabled bindings, or select a saved
`Desenvolvimento`, `Teste`, or `Produção` profile. Use `Novo perfil` or
`Editar seleção` to choose explicit service bindings for the current
Environment Instance; a revision conflict requires refreshing before retrying.

The `Prévia Start` / `Prévia Stop` selector displays decisions, shared
consumers, observed readiness and ports, and omitted resources. It never
executes services, even when the preview says a resource *would* be started or
stopped. `Excluir perfil…` removes only the profile after a second confirmation.
It does not delete or stop any database, process, container or Stack.

## Qualification matrix (HTTP, in-memory runtime evidence)

`apps/api/test/service-runtime-profile-isolation.test.ts` exercises the
actual Fastify routes, persisted revisioned stores, reconciled worktree IDs,
and a deterministic service catalog. It never starts Compose, accesses
databases, or makes host lifecycle calls.

| Scenario | Evidence expected |
| --- | --- |
| Controle Gastos `test` versus `production` | Distinct binding IDs, service references and observed ports, even when both databases advertise the same friendly name; switching profiles only changes the read-only plan/hash |
| Primary checkout versus linked worktree | Separate Environment Instance IDs and isolated profile lists; the worktree test DB cannot be adopted by a primary profile |
| Loto Lab shared cache | Consumer count from both projects retains the shared resource on a scoped Stop plan |
| Loto Lab with no profile | Existing unscoped plan remains available; no implicit migration or profile |
| Stale, foreign and disabled binding | HTTP 409/404; no fallback to another database by role/name |
| Dev Container | Host-level profile configuration and preview are rejected |
| Production selection | `executable: false` on both Start and Stop previews; no production deployment, migration or DB command |
| Persistence | Profiles and bindings rehydrate from independently versioned stores |

**Evidence boundary:** the test uses *distinct observed service references and
ports*, but those values alone cannot establish physical isolation of data,
volumes, credentials or network namespaces. Real database/volume separation,
permission boundaries, and Production Contract integrations still require an
explicit, non-mutating qualification against disposable local infrastructure,
with no real production endpoints or secrets. Do not interpret a successful
preview or these tests as proof of production database isolation.

## Physical qualification (disposable CI infrastructure)

The **Disposable PostgreSQL Isolation** CI check runs
`scripts/qualify-runtime-profile-isolation.mjs` in a fresh GitHub-hosted
runner. The script refuses to run unless `RUNTIME_ISOLATION_QUALIFY=1`
is explicitly set, and it never accepts a project path, production endpoint,
existing container name or database credentials from the caller. It creates
four new PostgreSQL 16 fixtures with cryptographically random resource names,
individual Docker named volumes and unique passwords:

- Controle Gastos primary **test** and linked-worktree **test**
- a **production-shaped disposable fixture**, never an actual production DB
- a separate Loto Lab fixture

The containers use `--network none`, publish **no host ports** and do
not mount host files. The check inspects this configuration and the exact volume
attachments. It seeds different markers, changes only the primary test marker,
checks the other three remain untouched, then recreates the primary test
container to prove persistence in *its own volume*. In parallel it creates a
real temporary Git repository with two linked worktrees, each mapped to a
distinct fixture volume. The script deletes only the randomly named resources
that it created, including on ordinary test failures; cleanup failures fail
the check.

A dedicated disposable Docker host is required for local opt-in runs:

```bash
docker pull postgres:16-alpine
RUNTIME_ISOLATION_QUALIFY=1 node scripts/qualify-runtime-profile-isolation.mjs
```

**Scope:** this checks physical fixture-volume and worktree separation.
The existing HTTP qualification verifies the *API* enforces profile and
Environment Instance IDs, stale bindings, read-only previews and shared
services. Neither check deploys, migrates, reads real production secrets or
authorizes database operations. The Production Contract is a separate
operational control: the mere selection of a `production` runtime profile
does not authorize its operations. An isolated physical fixture is **not**
evidence that any external production database is configured safely.

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
- The disposable Docker/Git CI check qualifies physical fixture-volume and
  worktree isolation; it does not inspect or verify any real production asset.
- Storage follows the existing local, single-writer JSON-store model; it does
  not promise transactionality across multiple independently writing
  Dashboard processes.
