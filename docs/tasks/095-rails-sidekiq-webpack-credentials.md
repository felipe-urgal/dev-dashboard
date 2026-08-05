# Task 095 — Operações Sidekiq, webpack e status de credentials Rails

## Status

Concluída.

## Contexto

Executada como frente paralela do inventário de `docs/PENDENCIAS.md`
("Adicionar operações reconhecidas para Sidekiq, Webpack e credenciais Rails,
mantendo catálogo fechado e mascaramento de segredos") e de
`docs/tasks/PARALLEL-WORK.md` ("Operações Sidekiq/Webpack/credenciais
Rails"). O equivalente no CLI bash já existe em `lib/rails/sidekiq/`,
`lib/rails/webpack/` e `lib/rails/credentials/` — esta task reimplementa a
mesma semântica (comando, arquivo de PID/log, condições de start/stop) no
dashboard web, sem alterar o CLI.

## Objetivo

Sidekiq e webpack-dev-server são processos de fundo de longa duração, como um
servidor — não execuções pontuais como scripts ou migrations. Por isso a
decisão arquitetural central foi generalizar `packages/process-manager` com
dois novos `kind` (`'worker'` para Sidekiq, `'webpack'` para
webpack-dev-server) em vez de reaproveitar o `ScriptExecutionService`
(pensado para execuções curtas com histórico) ou inventar um mecanismo
paralelo. Credentials, ao contrário, não é um processo de fundo: é status
somente leitura da existência de arquivos.

## Escopo entregue

### `packages/process-manager` — novo `kind` de processo gerenciado

- `ManagedKind` (`process-store.ts`) passou de `'server' | 'test'` para
  `'server' | 'test' | 'worker' | 'webpack'`; `packages/contracts` já reservava
  esses dois valores em `ManagedProcessKind`.
- `listStoredProcessEntries` e os regexes de retenção
  (`packages/process-manager/src/log-retention.ts`,
  `MANAGED_STATE_SUFFIX_PATTERN`/`MANAGED_LOG_SUFFIX_PATTERN`) foram
  generalizados para os quatro sufixos — a varredura de processos obsoletos
  (`sweepStaleProcesses`) e a limpeza de logs órfãos agora cobrem workers sem
  mudança de comportamento para `server`/`test`.
- `process-lifecycle.ts` ganhou `startManagedWorker(project, kind, command,
  stateDirectory)`: mesmo padrão de `startManagedTest` (sem porta, status
  inicial `running`, comando fornecido pelo chamador — não descoberto aqui),
  mas parametrizado por `kind` para permitir Sidekiq e webpack como
  processos independentes do mesmo projeto ao mesmo tempo.
- `ProcessManager` (classe pública) ganhou `getWorkerProcess`, `startWorker`,
  `stopWorker`, `readWorkerLog`, `clearWorkerLog` — todos reaproveitando a
  infraestrutura genérica já parametrizada por `kind` (identidade via
  `/proc/<pid>/cwd`, TERM→KILL, mascaramento de log, lock de start
  concorrente por `projectId:kind`).
- `process-status.ts` não precisou de um branch novo: um worker que morre sem
  ter sido explicitamente parado (`status !== 'stopping'`) cai no mesmo
  default de `server` (`failed`), o que é o comportamento esperado — só
  `test` trata `exitCode === 0` como conclusão normal.

### `apps/api` — detecção, comando fechado e rotas

- `apps/api/src/services/rails-runtime-service.ts` (novo): detecta Sidekiq
  (`bin/sidekiq` ou `Gemfile` com `sidekiq`) e webpack
  (`bin/webpack-dev-server`, dependência `webpack-dev-server` no
  `package.json`, ou `webpacker`/`shakapacker` no `Gemfile`); resolve o
  comando fechado (`bin/sidekiq` preferencial, senão `bundle exec sidekiq`;
  `bin/webpack-dev-server` preferencial, senão `yarn webpack-dev-server` com
  `yarn.lock` presente, senão `npx webpack-dev-server`) sempre como
  `{command, args}` para `spawn` sem `shell`; e expõe o status somente
  leitura de credentials.
- `apps/api/src/routes/rails/worker-routes.ts` (novo): `GET
  /projects/:projectId/rails/workers/:workerId`, `GET`/`DELETE
  .../logs`, `POST .../start`, `POST .../stop`, `POST .../restart`.
  `workerId` é validado por schema fechado (`enum: ['sidekiq', 'webpack']`)
  — o navegador nunca envia comando, argumento ou caminho.
- `apps/api/src/routes/rails/credentials-routes.ts` (novo): `GET
  /projects/:projectId/rails/credentials`, somente leitura.
- Restart é oferecido apenas para `sidekiq` (como no menu do CLI bash,
  `lib/rails/sidekiq/restart.sh`); `webpack` responde `409
  RAILS_WORKER_RESTART_UNSUPPORTED` — o CLI também não oferece essa opção
  para o webpack.
- Erros novos em `ApiErrorCode`: `RAILS_WORKER_UNSUPPORTED` (worker não
  detectado no projeto) e `RAILS_WORKER_RESTART_UNSUPPORTED`; erros de
  `ProcessManagerError` (`PROCESS_ALREADY_RUNNING`, `PROCESS_NOT_FOUND` etc.)
  são traduzidos pelo mesmo `translateWorkerError` usado pelas três rotas
  mutáveis.
- `railsRuntimeService` foi registrado em `AppContext`/`app.ts` ao lado do já
  existente `railsInspectionService`, sem alterar as rotas de migrations,
  models, routes e generators.

### `packages/contracts` — tipos novos

- `packages/contracts/src/rails-runtime.ts` (novo): `RailsWorkerId`
  (`'sidekiq' | 'webpack'`), `RailsWorkerOverview`, e
  `RailsCredentialsEnvironmentStatus`/`RailsCredentialsOverview`
  (`keySource: 'file' | 'environment-variable' | 'missing'`) — sem lógica,
  como o restante do pacote.

### `apps/web` — painel Rails

- `apps/web/src/api/rails.ts` ganhou as chamadas HTTP dos workers
  (`fetchProjectRailsWorker`, `start/stop/restartProjectRailsWorker`,
  `fetch/clearProjectRailsWorkerLog`) e de credentials
  (`fetchProjectRailsCredentials`).
- `apps/web/src/composables/useProjectRailsWorker.ts` (novo): estado e ações
  de um worker, seguindo o padrão `generation`/`RequestGate` de
  `useProjectProcessStatus` — invalida o próprio estado ao trocar de
  projeto, faz polling adaptativo (1s durante transição, 5s em repouso).
- `apps/web/src/composables/useProjectRailsCredentials.ts` (novo): consulta
  somente leitura, mesmo padrão de invalidação por projeto.
- `apps/web/src/components/ProjectRailsRuntimePanel.vue` (novo): dois
  cartões de worker (`Card`/`StatusBadge`, tom por `processToneFor`) com
  start/parar/reiniciar (Sidekiq) e visualização de logs com aviso de
  mascaramento, mais um cartão de credentials somente leitura por ambiente.
  Cada worker mostra explicitamente "não encontramos indícios" quando não
  detectado, em vez de esconder o cartão — mais claro que a operação existe
  mas não se aplica a este projeto.
- Nova aba "Sidekiq/webpack" em `ProjectDetailsView.vue`
  (`project-rails-runtime`), visível apenas para `project.type === 'rails'`.

## Decisões de segurança

1. **Catálogo fechado de identificador, não de comando.** O navegador só
   envia `workerId` (`'sidekiq' | 'webpack'`, validado por schema); a API
   redetecta o projeto e reconstrói `{command, args}` a cada chamada —
   nenhum campo de comando, argumento ou caminho chega do corpo da
   requisição.
2. **`spawn` sem `shell`**, herdado de `startManagedWorker`: mesmo padrão de
   `startManagedServer`/`startManagedTest`, `cwd` fixado no caminho canônico
   do projeto, grupo de processo próprio, identidade verificada via
   `/proc/<pid>/cwd` antes de qualquer sinal.
3. **Start recusa workers não detectados** (`RAILS_WORKER_UNSUPPORTED`, 409)
   — não é possível iniciar um Sidekiq num projeto sem indício da gem/binstub,
   mesmo manipulando a requisição diretamente.
4. **Logs mascarados e limitados**: `readWorkerLog`/`clearWorkerLog`
   reaproveitam a mesma leitura de `packages/process-manager` usada por
   servidor e testes — limite de 262144 bytes, corte pelo final do arquivo,
   `maskSensitiveLogContent` aplicado antes de qualquer resposta.
5. **Credentials são somente leitura e nunca leem o conteúdo criptografado
   nem o valor de nenhuma chave** — só `access()`/existência de arquivo
   (`config/credentials.yml.enc`, `config/master.key`,
   `config/credentials/<env>.yml.enc`/`.key`). Editar credentials
   criptografadas (equivalente a `bin/rails credentials:edit`) fica fora do
   escopo — ver Limitações.
6. Ações de `stop`/`restart` de worker não pedem confirmação de dois passos
   como as mutações Rails de migrations (que alteram o banco): seguem o
   mesmo nível de segurança das rotas equivalentes de `POST
   /projects/:projectId/process/stop`, já tratadas como "write-safe" local
   no checklist de `docs/architecture/security.md`.

## Testes automatizados

- `packages/process-manager/test/process-manager.test.ts`: início, consulta e
  parada de um worker (`kind: 'worker'`); Sidekiq e webpack como processos
  independentes e simultâneos do mesmo projeto; rejeição de início duplicado
  (`PROCESS_ALREADY_RUNNING`).
- `apps/api/test/rails-worker-routes.test.ts` (novo): detecção condicional
  (Sidekiq via `Gemfile`, webpack via `bin/webpack-dev-server`; projeto sem
  nenhum dos dois reporta `detected: false` e recusa `start` com
  `RAILS_WORKER_UNSUPPORTED`); `workerId` fora do catálogo recusado por
  schema; autenticação obrigatória; ciclo completo start→logs
  mascarados→stop; Sidekiq e webpack rodando simultaneamente sem colidir;
  restart do Sidekiq; recusa de restart do webpack
  (`RAILS_WORKER_RESTART_UNSUPPORTED`); status de credentials com
  ambiente `default` e `production`, sem o corpo da resposta conter o
  conteúdo do `.yml.enc` nem o valor de nenhuma chave; `404` para projeto
  inexistente.
- `apps/web/test/project-rails-runtime-panel.test.ts` (novo): Sidekiq
  detectado mostra ação de iniciar, webpack não detectado mostra o aviso
  "não encontramos indícios" sem o botão; clique em "Iniciar" chama a API
  com `workerId` correto e reflete o PID retornado; cartão de credentials
  mostra o status por ambiente sem que o HTML contenha o caminho da chave
  nem qualquer sequência hexadecimal longa (verificação anti-vazamento).
- `npm run typecheck`, `npm run build` e `npm test` na raiz, todos aprovados
  (API: 444 testes; web: 325 testes; process-manager: 48 testes — uma
  falha isolada de timing em teste pré-existente e não relacionado
  a esta task, `records a non-zero exit after the server was running`,
  reproduzida também na branch anterior a esta entrega e ausente em reruns
  sequenciais; ver Limitações).

## Limitações conhecidas

- **Edição de credentials fora do escopo.** Descriptografar, editar e
  recriptografar `config/credentials.yml.enc` exige decidir onde o
  `master.key`/`RAILS_MASTER_KEY` fica disponível para a API rodar
  `bin/rails credentials:edit` de forma não interativa, e como apresentar
  o conteúdo descriptografado (mesmo que temporariamente) sem violar o
  princípio de nunca expor segredos brutos ao navegador — isso é uma
  decisão de arquitetura própria, não uma extensão incremental desta
  entrega.
- **Detecção de webpack é heurística.** `webpack-dev-server` como
  dependência de `package.json`, ou `webpacker`/`shakapacker` no `Gemfile`,
  não garantem que o binstub funcione sem configuração adicional — a mesma
  limitação que já existe no `lib/rails/webpack/helpers.sh` do CLI
  (`_webpack_cmd` também tenta três alternativas em cascata sem checar se a
  configuração está completa).
- **Sem histórico de execuções.** Diferente do catálogo de scripts
  (`ScriptExecutionService`), workers não persistem histórico entre
  reinícios da API além do próprio arquivo de estado do process-manager —
  consistente com `server`/`test`, que também não têm histórico.
- **Teste de timing pré-existente e intermitente** em
  `packages/process-manager/test/process-manager.test.ts` sob carga
  concorrente (`npm test` na raiz roda todos os workspaces em paralelo);
  não é uma regressão desta task — reruns isolados do pacote passam de
  forma consistente.

## Arquivos alterados

- `packages/contracts/src/rails-runtime.ts` (novo)
- `packages/contracts/src/index.ts`
- `packages/process-manager/src/process-store.ts`
- `packages/process-manager/src/process-lifecycle.ts`
- `packages/process-manager/src/process-manager.ts`
- `packages/process-manager/src/index.ts`
- `packages/process-manager/src/log-retention.ts`
- `packages/process-manager/test/process-manager.test.ts`
- `apps/api/src/services/rails-runtime-service.ts` (novo)
- `apps/api/src/routes/rails/worker-routes.ts` (novo)
- `apps/api/src/routes/rails/credentials-routes.ts` (novo)
- `apps/api/src/routes/rails/helpers.ts`
- `apps/api/src/routes/rails.ts`
- `apps/api/src/http/response-schemas/rails.ts`
- `apps/api/src/http/api-error.ts`
- `apps/api/src/app-context.ts`
- `apps/api/src/app.ts`
- `apps/api/test/rails-worker-routes.test.ts` (novo)
- `apps/web/src/api/rails.ts`
- `apps/web/src/composables/useProjectRailsWorker.ts` (novo)
- `apps/web/src/composables/useProjectRailsCredentials.ts` (novo)
- `apps/web/src/components/ProjectRailsRuntimePanel.vue` (novo)
- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/router/index.ts`
- `apps/web/test/project-rails-runtime-panel.test.ts` (novo)
- `docs/tasks/095-rails-sidekiq-webpack-credentials.md` (novo, este arquivo)
