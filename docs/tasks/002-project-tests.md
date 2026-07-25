# 002 — Visão de testes do projeto

## Status

Implementada, aguardando code review e QA.

## Objetivo

Disponibilizar a aba `/projects/:projectId/tests` no dashboard web para
detectar como cada projeto executa testes, apresentar os comandos
reconhecidos e permitir uma execução controlada com logs e resultado
persistidos pelo próprio dashboard.

## Escopo entregue

- rota web `/projects/:projectId/tests` com aba dedicada no cabeçalho do projeto;
- detecção de runners no backend: Vitest, Jest, Node Test Runner, RSpec,
  Rails test, Minitest e pytest quando aplicável;
- lista dos comandos detectados com rótulo, descrição, runner e origem;
- estado dedicado quando nenhum runner é reconhecido;
- endpoints REST:
  - `GET /api/projects/:projectId/tests`;
  - `GET /api/projects/:projectId/tests/process`;
  - `POST /api/projects/:projectId/tests/:commandId/start`;
  - `POST /api/projects/:projectId/tests/process/stop`;
  - `GET /api/projects/:projectId/tests/process/logs`;
  - `DELETE /api/projects/:projectId/tests/process/logs`;
- execução via `ProcessManager` com `kind: 'test'`, arquivos de estado e
  log independentes dos processos de servidor (sufixos `.test.json` e
  `.test.log`);
- estados `idle`, `starting`, `running`, `stopped` e `failed` com exit
  code, duração e horários exibidos;
- polling do log e do processo enquanto a execução está ativa;
- bloqueio de dois testes simultâneos para o mesmo projeto
  (`PROCESS_ALREADY_RUNNING`);
- interrupção via SIGTERM → SIGKILL igual à do servidor;
- botão para limpar o log e reexecutar.

## Decisões técnicas

1. O `ProcessManager` foi generalizado internamente por `kind`
   (`server` | `test`), mantendo os métodos públicos existentes
   (`startServer`, `stopServer`, `readServerLog`, `clearServerLog`) e
   adicionando os equivalentes para testes (`startTest`, `stopTest`,
   `getTestProcess`, `readTestLog`, `clearTestLog`). Arquivos de estado
   passaram a usar o sufixo `.<kind>.json`/`.<kind>.log`, e mapas
   internos passaram a ser indexados por `${projectId}:${kind}`.
2. A detecção acontece exclusivamente no backend
   (`TestDetectionService`) e cacheia por `project.id`. O frontend só
   recebe o catálogo pronto, sem executar filesystem.
3. O `commandId` enviado pelo cliente é sempre validado contra a
   detecção atual antes do spawn. Nenhum shell arbitrário chega ao
   `spawn`; usamos `shell: false` e argumentos estruturados.
4. O `cwd` do processo vem do `ProjectStore`, nunca do payload.
5. O log e a retenção reaproveitam o mesmo pipeline dos servidores
   (`sweepStaleProcesses` agora limpa `.server.json` e `.test.json`,
   mapeando corretamente o log correspondente).
6. Comandos de teste rodam com `CI=true` para evitar prompts
   interativos.

## Arquivos principais

- `packages/contracts/src/test.ts`
- `packages/contracts/src/index.ts`
- `packages/process-manager/src/process-manager.ts`
- `packages/process-manager/src/log-retention.ts`
- `apps/api/src/services/test-detection-service.ts`
- `apps/api/src/routes/tests.ts`
- `apps/api/src/http/response-schemas.ts`
- `apps/api/src/http/api-error.ts`
- `apps/api/src/app.ts`
- `apps/api/src/app-context.ts`
- `apps/api/test/test-detection-service.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/components/ProjectTestsPanel.vue`
- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/router/index.ts`

## Critérios de aceite

- [x] detecção retorna comandos ordenados por prioridade;
- [x] projeto sem testes exibe estado dedicado;
- [x] `commandId` inválido resulta em `404 TEST_COMMAND_NOT_FOUND`;
- [x] `startTest` bloqueia quando já há execução ativa e é serializado
  contra chamadas concorrentes por `projectId:kind`;
- [x] `stopTest` encerra o grupo de processo com TERM/KILL;
- [x] servidores e testes coexistem sem sobrescrever estado;
- [x] frontend limpa dados residuais ao trocar de projeto;
- [x] typecheck, build e suíte de testes passam.

### Ajustes após code review

- Serialização de `startServer`/`startTest` via `withStartLock` para
  eliminar a corrida entre requisições concorrentes que passavam pela
  verificação antes de qualquer escrita.
- Schemas completos (`body` e `querystring`) declarados em todas as
  rotas de `apps/api/src/routes/tests.ts`, evitando payloads não
  validados na fronteira privilegiada.
- `TestDetectionService.invalidate` agora é chamado ao final do
  `POST /api/workspaces/:id/scan` e pode ser forçado por
  `GET /api/projects/:id/tests?refresh=true` (o botão **Atualizar** do
  painel já usa `refresh: true`).
- Detecção de pytest só é oferecida quando há sinal explícito de
  Python (`pytest.ini`, `conftest.py`, `[tool.pytest]` no
  `pyproject.toml` ou `pytest` em `requirements*.txt`).
- Fallback `bundle exec rails test` quando o projeto Rails não versiona
  `bin/rails`.
- `getManagedProcess` agora usa exclusivamente o `exitCode` observado
  para decidir entre `stopped` (0) e `failed` (≠0 ou desconhecido),
  eliminando o caso em que um teste morto por sinal externo era
  reportado como `stopped`.
- Removido o ramo redundante `(kind === 'test' && exitCode === 0)` em
  `recordChildExit`.
- Removida a flag `--silent` divergente do label npm.
- Polling do `ProjectTestsPanel` agora interrompe após 5 falhas
  consecutivas e informa o usuário para tentar novamente manualmente.
- As chamadas web para iniciar e interromper testes agora enviam um objeto
  JSON vazio, conforme o schema explícito das rotas, em vez de um corpo
  ausente que o Fastify rejeitava com `VALIDATION_ERROR`.

## Testes automatizados

- `apps/api/test/test-detection-service.test.ts` cobre:
  - detecção de Vitest via script;
  - projeto sem runners;
  - detecção de RSpec via Gemfile + `spec/`;
  - `resolveCommand` retornando `null` para id desconhecido.
- `apps/web/test/test-process-api.test.ts` cobre o corpo JSON exigido pelas
  rotas de início e interrupção de testes.

## QA manual esperado

1. Abrir a aba **Testes** de um projeto Node com Vitest e executar o
   comando; conferir logs, exit code e duração.
2. Repetir em um projeto Rails com RSpec (`bin/rspec` ou
   `bundle exec rspec`).
3. Iniciar um teste, atualizar a página e confirmar que o estado
   `running` sobrevive à recarga.
4. Iniciar dois comandos em sequência sem interromper o primeiro e
   verificar o bloqueio (`PROCESS_ALREADY_RUNNING`).
5. Interromper uma execução em andamento e conferir status `stopped`.
6. Forçar uma falha (ex. teste que quebra) e verificar `failed` e
   `exitCode` diferente de zero.
7. Iniciar um servidor e um teste no mesmo projeto e confirmar que
   ambos aparecem independentes.
8. Alternar rapidamente entre projetos na aba e conferir que o painel
   não mistura estados.

## Limitações conhecidas

- Streaming de log é feito por polling a cada ~1,5s enquanto a execução
  está ativa; ainda não há SSE ou WebSocket.
- Não há seleção de arquivo/teste individual, cobertura, watch mode ou
  edição de comandos personalizados (fora do escopo).
- Detecção de pytest é conservadora: exige `pytest.ini`,
  `pyproject.toml` ou diretório `tests/`.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
