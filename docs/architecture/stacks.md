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

## Persistência da definição

As definições explícitas de Stack são persistidas pelo backend em estado versionado.
A gravação valida a topologia antes de persistir, usa substituição atômica do arquivo
e mantém permissões restritivas. Entradas persistidas inválidas são ignoradas na
recarga em vez de contaminarem o conjunto válido.

A persistência não descobre dependências, não associa recursos ambiguamente e não
executa lifecycle. Ela apenas fornece uma fonte durável para a composição que o
usuário confirmou explicitamente.

## Validação de recursos

Antes de persistir uma definição, o backend comprova as referências básicas
contra o estado local conhecido. Todo node precisa apontar para um Project
existente. Quando o target carrega `environmentInstanceId`, a Environment
Instance precisa existir e pertencer ao mesmo Project declarado pelo node.

Essa validação é estritamente referencial e não tenta inferir serviço Compose, processo ou health check por
heurística. O objetivo deste slice é impedir referências órfãs ou cruzadas entre
projetos antes que lifecycle futuro ganhe autoridade sobre esses recursos.

## API

O backend expõe CRUD autenticado para definições explícitas de Stack em
`/api/stacks`. A validação de schema descarta propriedades extras e bloqueia limites
fora do contrato; a validação de topologia continua sendo a autoridade para
referências, duplicidades e ciclos antes da persistência.

A superfície é deliberadamente CRUD e autenticada. A API não aceita path, comando ou instrução de lifecycle. Ela apenas administra
a composição declarada que será consumida por adapters futuros.

## Check somente leitura

`GET /api/stacks/:stackId/check` retorna a definição da Stack, o plano
determinístico de start/stop e a saúde agregada observada naquele instante.

Nesta etapa, nodes de Environment Instance e processos gerenciados possuem evidência direta:
`ready`, `starting`, `stopped` e `failed` são derivados do lifecycle
backend-owned. `degraded` vira `unknown`, porque readiness não pode ser
comprovada. Nodes de processo usam o estado reconciliado do Process Manager e só são associados por `processId`, `projectId` e `environmentInstanceId` explícitos. Compose e health check continuam `unknown` até que seus adapters read-only sejam conectados.

Ausência de adapter, desaparecimento da Environment Instance ou drift de
ownership nunca vira `ready`; o Check sempre falha fechado para `unknown`.

## Deferred lifecycle

This slice does not execute Start/Stop/Restart. A later adapter layer must delegate each operation back to the resource-owning domain and preserve its confirmation, ownership and revalidation rules.
