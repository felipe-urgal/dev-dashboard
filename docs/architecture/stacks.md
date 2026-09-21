# Stacks

Stacks compose multiple existing project/runtime resources. They do not replace Workspace, Project, Development Environment Instance, Process Manager, Docker Compose, Port Registry or domain-specific lifecycle ownership.

## First slice: contract and topology

A Stack contains explicit nodes and explicit dependencies. Nodes point at resources already owned by existing domains:

- Development Environment Instance;
- managed process;
- Docker Compose service;
- known health check.

Dependencies are directional: `nodeId` depends on `dependsOnNodeId`.

The topology service validates the definition and creates a deterministic start order. Stop order is the exact reverse. Unknown nodes, self-dependencies, duplicate edges and cycles fail closed.

This first slice does not infer dependencies from Compose/Profile evidence and does not persist suggestions automatically.

## Health

Node state uses:

- `ready`;
- `starting`;
- `stopped`;
- `failed`;
- `blocked`;
- `unknown`.

Aggregate health is conservative. Any failure wins, then blocked, then starting. The Stack is `ready` only when every observed node is ready, and `stopped` only when every node is stopped. Mixed or incomplete evidence becomes `unknown`.

## Deferred lifecycle

This slice does not execute Start/Stop/Restart. A later adapter layer must delegate each operation back to the resource-owning domain and preserve its confirmation, ownership and revalidation rules.
