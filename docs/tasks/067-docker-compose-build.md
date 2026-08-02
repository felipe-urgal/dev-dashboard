# Task 067 — Build assíncrono de serviços Docker Compose

## Status

Concluída.

## Objetivo

A task 065 detecta serviços `build:`-only e marca "requer build", mas sem
nenhuma ação disponível — o usuário precisava sair do dashboard para
`docker compose build` manualmente antes de conseguir usar "Iniciar". Esta
task adiciona uma ação de build por serviço, assíncrona e com progresso
consultável, mantendo o mesmo modelo de segurança (catálogo fechado,
`execFile`/`spawn` sem shell, logs limitados e mascarados).

## Escopo entregue

- `packages/process-manager`: novo `kind` `'compose-build'`, com identidade
  por instância (nome do serviço, via `slugifyProcessInstance`) além de
  `projectId + kind` — permite builds concorrentes de serviços diferentes do
  mesmo projeto, diferente de `server`/`test` (uma instância por projeto).
  `resolveLogFile`/`resolveProcessFile`, as chaves de
  `observedExits`/`exitWaiters`, e os regexes de `sweepStaleProcesses`
  (`MANAGED_STATE_SUFFIX_PATTERN`/`MANAGED_LOG_SUFFIX_PATTERN`) foram
  generalizados para aceitar esse segmento de instância opcional, mantendo
  compatibilidade com os arquivos `server`/`test` já existentes em disco.
  `ProcessManager` ganhou `startComposeBuild`/`stopComposeBuild`/
  `getComposeBuildProcess`/`readComposeBuildLog`/`clearComposeBuildLog`.
- `apps/api`: `DockerComposeService` recebe um `ProcessManager` opcional via
  DI (`DOCKER_BUILD_UNSUPPORTED` quando ausente) e ganha
  `startBuild`/`stopBuild`/`getBuildStatus`/`readBuildLog`/`clearBuildLog`.
  `runAction('start', …)` continua rejeitando serviços `requiresBuild` com
  `DOCKER_SERVICE_REQUIRES_BUILD`, exceto quando o build mais recente desse
  serviço terminou com `status: 'stopped'` e `exitCode: 0`.
- Rotas novas em `apps/api/src/routes/docker-compose.ts`:
  `GET/POST /projects/:id/docker/services/:serviceName/build`,
  `POST .../build/start`, `POST .../build/stop`,
  `GET/DELETE .../build/logs` — mesmo envelope e mapeamento de erro que as
  rotas de processo gerenciado (`processManagerApiError`), reaproveitando
  `managedProcessResponseSchema`/`processLogSnapshotResponseSchema`.
- `packages/contracts`: `ManagedProcessKind` ganha `'compose-build'`,
  `ManagedProcess` ganha o campo opcional `composeServiceName`.
- `apps/web`: `ProjectDockerPanel.vue` ganha botão "Buildar" por serviço
  `requiresBuild`, badge de status (Buildando/Build concluído/Build falhou),
  botão "Logs do build", e polling adaptativo (1,5s enquanto algum build
  está em andamento, parado quando todos terminam) — por serviço, não por
  projeto, já que builds são concorrentes.
- `docs/architecture/docker-compose-design.md` atualizado: build sai da
  lista "fora do escopo", nova seção "Build assíncrono (task 067)"
  documenta a decisão de identidade por instância.

## Critérios de aceite

- `startBuild` só chega a `execFile`/`spawn` depois de validar o serviço
  contra a lista já detectada (mesmo `requireService` de 065);
- dois builds do mesmo serviço não rodam simultaneamente
  (`PROCESS_ALREADY_RUNNING`, 409); builds de serviços diferentes do mesmo
  projeto rodam em paralelo;
- `start` de um serviço `requiresBuild` continua bloqueado até um build
  bem-sucedido existir; falha de build não libera o `start`;
- logs de build têm o mesmo limite (262144 bytes) e mascaramento de
  segredos que logs de processo gerenciado;
- build não exige confirmação em duas etapas (não é destrutivo).

## Validação

- testes novos: 3 do `process-manager` (build concorrente por serviço,
  serialização por serviço, log/exit code), 2 do `DockerComposeService`
  (guarda de build + liberação após sucesso, erro sem `ProcessManager`),
  1 de rota (`docker-compose-routes.test.ts`), 2 do painel Vue;
- smoke manual ponta a ponta contra a API real (`docker` presente, sem
  daemon no ambiente): `POST build/start` → `201`, polling de
  `GET build` até `status: 'failed'` (esperado sem daemon), `GET
  build/logs` com a mensagem de erro do Docker, e `POST /docker/actions
  start` continuando bloqueado com `DOCKER_SERVICE_REQUIRES_BUILD` após a
  falha — confirma o guard e o ciclo de vida assíncrono de ponta a ponta;
- `npm run typecheck` passou em todos os workspaces;
- `npm run build` passou (packages, api, web);
- `npm test` passou: scripts (6), API (335), core (8), process-manager (45),
  project-discovery (1), web (257).

## Limitações

- builds concorrentes são só por serviço — dois builds do mesmo serviço
  continuam serializados (mesma regra de `server`/`test`);
- sem streaming incremental de log durante o build; a UI faz polling do
  status e busca o log sob demanda (mesmo padrão pontual de `logs` da
  task 065), não segue `docker compose build` com `-f`;
- `requiresBuild` continua vindo só do parse estático do compose file — não
  verifica se uma imagem já existe localmente fora de um build feito pelo
  próprio dashboard;
- `DOCKER_BUILD_UNSUPPORTED` é só uma salvaguarda de injeção de dependência
  para testes; em produção o `ProcessManager` sempre está disponível via
  `app-context.ts`.

## PR

[#148 — Adiciona build assíncrono de serviços Docker Compose](https://github.com/felipe-urgal/dev-dashboard/pull/148)
