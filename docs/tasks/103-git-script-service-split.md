# Task 103 — Dividir `GitService` e `ScriptExecutionService` por domínio

## Status

Concluída.

## Objetivo

Reduzir as duas classes de serviço que voltaram a crescer acima de 400
linhas depois da Fase 7 de refatoração
(`docs/architecture/refactoring-arquivos-grandes.md`), sem alterar nenhuma
assinatura pública nem comportamento externo.

## Decisão principal

Refatoração pura, sem mudança de rota/contrato/schema. Seguir o padrão já
validado com `ProcessManager` na Fase 6: cada classe vira um orquestrador
fino que delega para módulos por domínio, recebendo o estado compartilhado
(`Map`s/`Set`s privados) por parâmetro em vez de replicá-lo em cada módulo.

## Escopo entregue

- **`apps/api/src/services/git-service.ts`** (583 → 149 linhas): dividido em
  `git-service/confirmation.ts` (`consumeMutationConfirmation`,
  compartilhado por todos os domínios), `branch-operations.ts`
  (`createBranch`/`switchBranch`/`pull`/`push`), `file-operations.ts`
  (`stageFile`/`unstageFile`/`discardFile`/`removeUntrackedFile`),
  `commit-operations.ts` (`commit`/`amend`/`save`), `stash-operations.ts`
  (`stashPush`/`stashPop`) e `read-operations.ts`
  (`getOverview`/`getDiffSnapshot`/`getFileDiff`/`getFileLines`, sem
  confirmação por serem leituras). Cada domínio de mutação é uma fábrica
  (`createBranchOperations(confirmations)` etc.) que recebe a mesma
  instância de `GitMutationConfirmationService` por injeção; o arquivo
  principal só instancia as quatro fábricas e delega cada método público em
  uma linha.
- **`apps/api/src/services/script-execution-service.ts`** (628 → 143
  linhas): dividido usando um `ScriptExecutionContext` único
  (`script-execution/state.ts`) que reúne os 6 `Map`s/`Set`s privados que a
  classe original coordenava (`executions`/`activeProjects`/
  `confirmations`/`pendingWrites`/`subscribers`/`eventTimers`) mais
  configuração (`stateDirectory`/`historyLimit`/`retentionMs`/
  `createLogStream`/`detection`), passado por parâmetro para quatro módulos:
  `store.ts` (persistência em disco, `restoreExecutions` na inicialização,
  `pruneHistory`, leitura de histórico/log), `events.ts` (assinatura SSE com
  limite por execução/total, `emitEvent`/`scheduleLogEvent` com throttle de
  200ms), `authorization.ts` (catálogo fechado de ações, validação de
  variáveis, token de confirmação vinculado a projeto+ação+assinatura) e
  `lifecycle.ts` (`startExecution`/`spawnExecution`/`cancelExecution`). O
  `Promise` de restauração (`ready`) ficou fora do contexto — cada método
  público do orquestrador continua fazendo `await this.ready` antes de
  delegar, exatamente onde o método original fazia isso.
- `docs/architecture/refactoring-arquivos-grandes.md` ganhou a seção "Fase 8"
  registrando a divisão e removendo as duas classes do inventário de
  arquivos acima de 400 linhas.

## Critérios de aceite

- `git-service.ts` e `script-execution-service.ts` ficam abaixo de ~400
  linhas (149 e 143), contendo só a classe orquestradora;
- `npm run typecheck`, `npm run build` e `npm test` continuam verdes sem
  nenhuma mudança nos testes existentes — 86 testes de `git-service`/
  `git-service-mutations`/`git-service-diff`/`git-amend-all-changes`/
  `git-file-confirmation-route`/`git-mutation-routes`/`git-sync-service`/
  `git-sync-routes`/`project-change-impact-service`, mais 14 de
  `script-execution-service`/`script-events-route`;
- nenhuma rota, schema de resposta ou tipo em `packages/contracts` mudou;
- `npm run docs:api:check` continua passando sem alteração (nenhum shape de
  API mudou).

## Fora de escopo

- mudar comportamento de qualquer operação Git ou de script;
- extrair `ProjectGitPanel.vue`/`ProjectGitBranchesPage.vue` ou os demais
  componentes Vue acima de 400 linhas listados no reinventário da Fase 7;
- revisitar o mecanismo de confirmação compartilhado além de injetá-lo nos
  novos módulos.

## Validação

- `npm run typecheck` e `npm run build` passaram em todos os workspaces;
- `npm test` passou (API — incluindo os 100 testes acima —, web, `core`,
  `process-manager`, `project-discovery`);
- `npm run docs:api:check` confirmou que `docs/architecture/api-reference.md`
  não precisou mudar.

## Limitações conhecidas

- `ScriptExecutionContext` ainda concentra bastante estado num único
  objeto — é o mesmo trade-off que `ProcessStoreContext` aceita em
  `process-manager.ts`, deliberado para não introduzir sincronização extra
  entre módulos;
- nenhum novo teste foi adicionado nesta task — o objetivo era preservar
  comportamento, verificado pela suíte existente permanecendo verde.
