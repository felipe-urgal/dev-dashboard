# Plano de refatoração — arquivos acima de 400 linhas

## Status

Em mapeamento. Nenhum código foi alterado ainda — este documento é o plano
aprovado antes de qualquer divisão real de arquivo, conforme combinado.

## Regra geral

- refatoração pura: nenhuma assinatura pública muda (classes exportadas,
  métodos públicos, props/emits de componente, contratos de API). Quem
  consome esses arquivos hoje não percebe a diferença;
- meta de até ~200 linhas por arquivo novo; alguns arquivos-orquestradores
  podem ficar um pouco acima disso quando a alternativa é uma divisão
  artificial que piora a leitura;
- cada arquivo extraído recebe teste próprio quando a lógica movida já não
  tinha cobertura direta (ex.: hoje `process-manager.test.ts` testa através
  da classe pública — isso continua funcionando sem mudança, já que a API
  pública não muda);
- ordem de execução: um arquivo por vez, com `npm run typecheck && npm run
  build && npm test` rodando limpo antes de passar para o próximo.

## Inventário (arquivos acima de 400 linhas, fora de teste)

36 arquivos no total. Os 3 primeiros têm plano detalhado abaixo; os demais
entram na fila na mesma ordem (maior para menor) depois que o padrão de
divisão for validado nesses três.

```
1070  packages/process-manager/src/process-manager.ts        [detalhado]
 885  apps/web/src/components/ProjectLogsPanel.vue            [detalhado]
 871  apps/web/src/components/ProjectGitDiffPage.vue          [detalhado]
 842  apps/api/src/services/git-service.ts
 823  apps/web/src/components/ProjectGitHistoryPage.vue
 747  apps/web/src/components/ProjectScriptsPanel.vue
 743  apps/web/src/components/ProjectDatabasePanel.vue
 683  apps/web/src/views/ActivityView.vue
 666  apps/api/src/routes/tests.ts
 660  apps/api/src/services/script-execution-service.ts
 649  apps/api/src/services/rails-inspection-service.ts
 629  apps/web/src/components/ProjectGitPanel.vue
 627  apps/web/src/components/ProjectReadmePanel.vue
 611  apps/web/src/components/ProjectGitBranchesPage.vue
 604  apps/api/src/services/git-pull-request-service.ts
 600  apps/api/src/routes/processes.ts
 593  apps/web/src/views/ProcessesView.vue
 590  apps/web/src/components/ProjectServerPanel.vue
 588  apps/web/src/components/NoticeCenter.vue
 587  apps/api/src/services/test-detection-service.ts
 573  apps/web/src/components/ProjectGitPullRequestPage.vue
 573  apps/api/src/services/git-stash-service.ts
 571  apps/web/src/views/DashboardView.vue
 539  apps/web/src/components/CommandPalette.vue
 530  apps/web/src/test-log-inspector.ts
 519  apps/api/src/services/git-commit-details-service.ts
 493  apps/web/src/utils/git-diff-view.ts
 471  apps/api/src/services/database-snapshot-service.ts
 467  apps/web/src/stores/dashboard.ts
 461  apps/web/src/utils/git-syntax-highlight.ts
 456  apps/api/src/services/git-sync-service.ts
 437  apps/api/src/routes/git-workspace.ts
 434  apps/web/src/composables/useProjectTestsPanel.ts
 430  apps/api/src/routes/rails.ts
 425  apps/api/src/routes/projects.ts
 423  apps/api/src/routes/git-stash.ts
 404  apps/web/src/components/ProjectTestsGuidedPanel.vue
 404  apps/api/src/services/git-undo-service.ts
```

## 1. `packages/process-manager/src/process-manager.ts` (1070 linhas)

Classe `ProcessManager` com estado privado compartilhado entre praticamente
todos os métodos (`processDirectory`, `logDirectory`, dois `Map` de
rastreamento de saída de processo, um `Map` de locks de start). A divisão
não pode ser "um arquivo por método" porque muitos métodos dependem desse
estado — a estratégia é agrupar por responsabilidade e passar o estado
necessário explicitamente, em vez de depender de `this`.

### Novos arquivos

**`packages/process-manager/src/process-store.ts`** (~140 linhas)
Persistência em disco do estado de um processo gerenciado — o que hoje são
métodos privados que só leem/escrevem os arquivos `.json`/`.log`, sem
nenhuma lógica de processo em si.
- `createProjectKey`, `resolveLogFile`, `resolveProcessFile`
- `readStoredProcess`, `writeStoredProcess`
- `terminalProcess` (função livre já existente, hoje solta no topo do arquivo)
- `listStoredProcessEntries` (o loop de `readdir` + parse + validação que
  hoje vive dentro de `listProcesses`)

**`packages/process-manager/src/process-exit-tracking.ts`** (~160 linhas)
Os dois `Map` (`observedExits`, `exitWaiters`) e tudo que só existe para
saber quando um processo-filho morreu — sem saber nada sobre persistência.
Vira um pequeno factory `createExitTracker()` retornando
`{ observeChild, waitForObservedExit, waitForManagedExit, clearObservedExit }`,
para o `ProcessManager` guardar uma instância em vez de dois `Map` soltos.
`recordChildExit` recebe a persistência por parâmetro (callback), não por
import direto — assim este módulo não sabe nada sobre arquivo em disco.
- `observeChild`, `waitForObservedExit`, `waitForManagedExit`,
  `clearObservedExit`, `recordChildExit`
- `waitForProcessExit` (função livre já existente)

**`packages/process-manager/src/process-lifecycle.ts`** (~220 linhas)
Start/stop de fato — spawn, verificação de porta, sinais.
- `startManagedServer` (hoje `startServerLocked`)
- `startManagedTest` (hoje `startTestLocked`)
- `stopManagedProcess`
- `sendSignal`

**`packages/process-manager/src/process-logs.ts`** (~110 linhas)
Leitura/limpeza de log — I/O de arquivo com mascaramento, sem nada de
processo.
- `readManagedLog` (hoje `readLog`)
- `clearManagedLog` (hoje `clearLog`)

**`packages/process-manager/src/process-manager.ts`** (orquestrador, ~190 linhas)
A classe `ProcessManager` continua exportada com o mesmo nome, construtor e
todos os métodos públicos com a mesma assinatura — cada um vira uma chamada
de uma linha para os módulos acima, passando um contexto
`{ stateDirectory, processDirectory, logDirectory }` e a instância do
exit tracker. `withStartLock` fica aqui (é orquestração de concorrência do
próprio `ProcessManager`, não pertence a nenhum dos módulos acima).

### Risco

Este pacote é consumido diretamente pela API (`app-context.ts` faz
`new ProcessManager()`) e é o coração da segurança de processos do projeto
(identidade de PID, `SIGTERM`→`SIGKILL`, diretórios `0700`/arquivos `0600`).
Nenhuma dessas garantias muda de comportamento — só de arquivo. A suíte
`packages/process-manager/test/*.test.ts` já testa através da API pública da
classe, então continua validando sem alteração.

## 2. `apps/web/src/components/ProjectLogsPanel.vue` (885 linhas)

Script tem ~280 linhas; o resto é template do inspetor de logs (lista de
requisições + dossiê da requisição selecionada + modo raw), que já existe
como conceito desde a task 053. Divisão por componente de apresentação, não
por arquivo genérico de "utils":

- **`ServerLogRequestList.vue`** — coluna de requisições agrupadas, busca,
  filtro de categoria, paginação (`cappedGroups`, `hiddenGroupsCount`,
  `loadMoreRequests`, `selectGroup`, `groupSelectionKey`, `groupMatchesCategory`);
- **`ServerLogRequestDossier.vue`** — painel da requisição selecionada: SQL
  agrupado com syntax highlight, detecção de N+1, árvore de parâmetros
  (`selectedGroup`, `selectedRequestGroup`, `selectedSqlGroups`,
  `selectedN1Group`, `selectedParams`, `highlightedSql`, `copyRequestId`);
- **`ServerLogRawView.vue`** — modo de linhas cruas (`cappedRawLines`,
  `hiddenRawLinesCount`, `loadMoreRawLines`, `rawLineClass`,
  `lineMatchesCategory`);
- **`composables/useServerLogFilters.ts`** — `searchQuery`,
  `categoryFilter`, `resetFilters`, compartilhado entre lista e modo raw;
- **`ProjectLogsPanel.vue`** fica como orquestrador: alterna entre modo
  requests/raw, monta os composables e passa os dados para os três
  componentes acima (~150 linhas).

## 3. `apps/web/src/components/ProjectGitDiffPage.vue` (871 linhas)

Script tem ~490 linhas. Diferente do painel de logs, aqui a divisão que
rende mais é por **composable** (lógica), não por componente de tela — a
tela em si (lista de arquivos + visualizador) já é relativamente coesa
visualmente.

- **`composables/useGitDiffEntries.ts`** — estado de `entries`, `buildEntry`,
  `loadFileDiff`, `requestFileDiff`, `drainPendingLoads`, `registerCard`,
  `setupObserver` (o `IntersectionObserver` que carrega diffs sob demanda
  conforme o card entra na viewport — hoje é o bloco mais denso do arquivo);
- **`composables/useGitDiffContextExpansion.ts`** — `expandContext`,
  `nextExpansionAbove`/`Below`, `canExpandAbove`/`Below`, `hunkLines`,
  `splitRowsFor` (expandir contexto acima/abaixo de um hunk);
- **`composables/useGitDiffViewPreference.ts`** — `viewMode`,
  `readStoredViewMode`/`persistViewMode`/`selectViewMode` (preferência
  unificado/lado-a-lado persistida em `localStorage`);
- **`ProjectGitDiffPage.vue`** fica com o restante: busca/filtro de status,
  métricas (`totalAdditions`/`totalDeletions`/`viewedPercent`), template e
  a composição dos três composables acima (~300 linhas de script). Se ainda
  passar de 400 somando o template, o candidato natural de fase 2 é extrair
  a lista lateral de arquivos como `GitDiffFileList.vue`.

## Próximo passo

Aguardando aprovação deste plano (arquivos 1–3) antes de escrever qualquer
código. Depois de validado o padrão aqui, sigo mapeando os 33 arquivos
restantes em lotes, sem repetir esse nível de detalhe por escrito para cada
um — só onde a divisão não for óbvia pelo nome/tamanho dos blocos.
