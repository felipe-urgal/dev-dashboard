# Local CI com act

Local CI permite reproduzir localmente jobs detectados em workflows GitHub Actions usando `act`. O resultado é sempre uma **aproximação local** e nunca substitui o estado remoto oficial do GitHub CI.

## Princípios

- `provider=act` e `approximation=true` permanecem explícitos em catálogo e execuções;
- o browser escolhe somente combinações `workflowFile + jobId + event` presentes no catálogo detectado pelo backend;
- path do projeto, executável, argv, mounts, secrets e variáveis arbitrárias não são autoridade do browser;
- ausência de `act` ou Docker é estado suportado;
- Local CI não satisfaz sozinho checks remotos de Release Readiness;
- workflows locais executam código do repositório com as permissões do usuário local.

## Discovery e preflight

`LocalCiDiscoveryService` lê somente `.github/workflows/*.yml|yaml` dentro do projeto, rejeita symlinks e limita quantidade/tamanho dos arquivos.

O catálogo expõe somente:

- workflow e arquivo;
- job/id;
- eventos declarados;
- disponibilidade do provider.

O preflight executa comandos fechados para `act --version` e `docker info`. Os estados públicos são:

- `available`;
- `act-missing`;
- `docker-unavailable`.

## Execução destacável

`LocalCiExecutionService` revalida o catálogo imediatamente antes do start e constrói o argv através de `buildActJobCommand`.

Cada run possui ownership por `projectId + runId` e reutiliza `DetachableExecutionService` para:

- execução sem shell;
- buffer bounded e masking compartilhado;
- cancelamento;
- timeout;
- reattach/follow sem iniciar outro processo.

O ambiente do processo é reconstruído por allowlist operacional. Tokens GitHub, `DATABASE_URL`, `.env` e variáveis arbitrárias do processo da API não são propagados.

Erros de domínio são normalizados antes da fronteira HTTP:

- request fora do catálogo;
- Local CI indisponível;
- limite de concorrência;
- falha de start;
- run inexistente;
- cancelamento de run já finalizado.

Mensagens brutas de spawn/processo não atravessam o contrato público.

## HTTP e streaming

A API autenticada expõe:

- `GET /api/projects/:projectId/local-ci/catalog` — catálogo + disponibilidade;
- `POST /api/projects/:projectId/local-ci/runs` — inicia uma combinação presente no catálogo;
- `GET /api/projects/:projectId/local-ci/runs/:runId` — snapshot atual;
- `POST /api/projects/:projectId/local-ci/runs/:runId/cancel` — cancela somente um run pertencente ao projeto;
- `GET /api/projects/:projectId/local-ci/runs/:runId/connect` — WebSocket de reattach/follow.

O WebSocket envia mensagens:

- `ready` com o snapshot/buffer atual;
- `output` com novos chunks;
- `exit` com o snapshot final;
- `error` quando o run não pode ser reanexado.

A API aceita no start apenas `workflowFile`, `jobId` e `event`. Campos adicionais são rejeitados pelo schema e a seleção é revalidada contra o catálogo no serviço imediatamente antes de iniciar `act`.

## UI

A superfície web por projeto consome somente o contrato HTTP/streaming acima:

- rota `/projects/:projectId/local-ci` dentro do shell compartilhado do projeto;
- catálogo apresentado sem permitir parâmetros fora de `workflowFile + jobId + event`;
- aviso permanente de `Local / aproximação`, separado do CI remoto oficial;
- estados explícitos para `act` ausente e Docker indisponível;
- start, acompanhamento de logs, reattach do `runId` durante a sessão do navegador e cancelamento;
- buffer do cliente também permanece bounded para não transformar streaming em crescimento de memória sem limite.

O `runId` pode ser preservado em `sessionStorage` apenas como conveniência de reattach. A API continua validando ownership por `projectId + runId`; a UI não recebe autoridade adicional por persistir esse identificador.

## Escopo seguinte

Integração opcional com Task Context pode consumir a mesma identidade de run futuramente, sem promover Local CI a verdade remota ou substituir checks do GitHub.
