# Plano — quebra de arquivos grandes em módulos menores

## Status

Fases 1, 2, 3 e 4 concluídas (sub-etapa 2 fechada com composables extraídos em 4 dos 7 componentes
grandes; os 3 componentes Git restantes foram avaliados e decidiu-se não extrair, ver detalhes na
Fase 4). **Fase 5 concluída**: os 19 arquivos da camada "enhancer" vanilla-DOM foram quebrados
mecanicamente em módulos por responsabilidade (de `git-history-page-enhancer.ts`, 1130 linhas, até
`git-diff-page-enhancer.ts`, 73 linhas), sem nenhuma mudança de comportamento. **Fase 6 concluída**:
etapa 1 (funções livres, 1430 → 1070 linhas) e etapa 2 (métodos acoplados ao estado privado da
classe, 1070 → 157 linhas, mais 5 módulos novos) — `process-manager.ts` sai da lista de arquivos
acima de 400 linhas. **Fase 7 (reinventário) adicionada**: levantamento atualizado dos demais
arquivos acima de 400 linhas hoje no repo, depois de várias entregas funcionais terem crescido de
novo arquivos já tocados nas fases anteriores — aguardando decisão de início, sem código escrito
ainda para esta fase.

> Nota de histórico: um plano concorrente (`docs/refactor/plano-arquivos-grandes.md`) foi escrito
> por engano numa sessão anterior sem localizar este documento, tratando `process-manager.ts` e
> `ProjectGitDiffPage.vue` como nunca refatorados. Foi removido e o conteúdo relevante (inventário
> atualizado) foi incorporado à Fase 7 abaixo — este arquivo é a única fonte de verdade sobre o
> plano de quebra de arquivos grandes.

## Contexto

Um levantamento do tamanho dos arquivos do monorepo web (`apps/`, `packages/`) mostrou vários
arquivos com centenas a milhares de linhas concentradas em poucos pontos. Este documento registra
onde essas linhas estão, por que se acumularam ali e um plano de extração mecânica — reorganizar em
arquivos menores por responsabilidade, sem alterar comportamento — para ser executado em fases
futuras, uma de cada vez.

Isso não é uma entrega funcional (não muda nada visível para quem usa o dashboard), por isso vive
aqui em vez de em `docs/tasks/`. Quando uma fase for executada, registrar o resultado neste arquivo
mesmo, na seção da fase correspondente.

## Onde as linhas estão concentradas

| Área | Exemplos | Causa raiz |
|---|---|---|
| Camada "enhancer" web (`apps/web/src/*-enhancer.ts`/`.css`, `*-fix.ts`/`.css`, `*-polish.css`, `*-redesign.css`) | ~30 arquivos; `git-history-page-enhancer.ts` (1045 linhas), `git-stash-enhancer.ts` (866), `components.css` (2921), `database-layout-polish.css` (1961), `scripts-explorer-redesign.css` (1496) | Scripts vanilla-DOM (`MutationObserver`/`querySelector`) que corrigem/enriquecem a UI depois que os componentes Vue já renderizaram, instalados um a um em `main.ts`. Cada arquivo mistura formatação, funções `renderX(section)` e wiring de eventos no mesmo módulo. Padrão preservado deliberadamente pela task 023 (consolidação de CSS), não um acidente. |
| Componentes `.vue` grandes | `ProjectLogsPanel.vue` (1640), `ProjectServerPanel.vue` (1423), `ProjectGitPanel.vue` (1289), `ProjectGitDiffPage.vue` (1281), `ProjectScriptsPanel.vue` (1004) | Boa parte das linhas é `<style scoped>` inline (ex. `ProjectLogsPanel.vue`: script linhas 1–436, template 438–863, style 865–1640 — quase metade do arquivo). O `<script setup>` mistura várias responsabilidades (polling, parsing, filtros, formatação) em refs/funções soltas em vez de composables. |
| `apps/web/src/api.ts` (859 linhas) | — | ~55 funções exportadas cobrindo saúde, scripts, workspaces, processos, git, tests, rails, activities e settings, todas sobre um único `requestJson` central, num arquivo só. |
| `packages/process-manager/src/process-manager.ts` (1430 linhas) | — | Uma única classe `ProcessManager` concentrando resolução de diretório de estado, checagem de porta, resolução de comando por tipo de projeto (Rails/Node), start/stop, leitura/limpeza de log, rastreio de saída observada (`observedExits`) e persistência em disco. Várias dessas partes já são funções livres sem estado de instância. |
| `apps/api/src/http/response-schemas.ts` (683 linhas) | — | ~50 schemas exportados, já naturalmente agrupáveis por domínio (erros comuns, workspaces/projects, processos, scripts, git, tests, rails, activity). |
| `apps/api/src/routes/projects.ts` (685 linhas) | — | Contém favicon + listagem de projeto **e também** as 8 mutações Git (create-branch, switch-branch, pull, push, commit, save, stash-push, stash-pop — linhas 410–646), que deveriam estar junto dos demais `routes/git-*.ts` já existentes (`git-branch-delete.ts`, `git-stash.ts`, `git-sync.ts` etc.) — inconsistente com a própria convenção de arquivo-por-recurso já usada no repo. |

## Fases propostas

### Fase 1 — API (baixo risco, mecânica pura) — concluída

- Movidas as 8 mutações Git de `routes/projects.ts` (685 → 370 linhas) para
  `routes/git-mutations.ts` (novo, 355 linhas), seguindo a convenção `git-*.ts` já usada pelos
  demais arquivos de rota Git. Registrado em `app.ts` como um plugin próprio, com o mesmo
  `projectStore`/`gitService` do plugin de projetos.
- `response-schemas.ts` (683 linhas) quebrado em
  `response-schemas/{common,scripts,workspaces-projects,processes,tests,git,rails,activity}.ts`.
  O arquivo original virou um barrel de 8 linhas (`export * from './response-schemas/...'`), então
  nenhum import externo (`from '../http/response-schemas.js'`) mudou. Helpers internos não
  exportados (`retentionValueLimitSchema`, `gitFileStatusEnum`, `activityStatusEnum`,
  `scriptActivityResponseSchema`, `processActivityResponseSchema`) foram para o arquivo do domínio
  que os usa.
- Verificação: `npm run typecheck`, `npm run build` e `npm test` passam no monorepo inteiro (240
  testes da API, 163 do frontend, todos os pacotes) sem nenhuma mudança de comportamento.

### Fase 2 — `apps/web/src/api.ts` (baixo risco) — concluída

- `requestJson`, `requestJsonAttempt`, bootstrap de sessão do navegador, `ApiRequestError`,
  `followEventStream` (helper genérico de SSE) e `fetchHealth` foram para `api/core.ts`.
- Um arquivo por domínio: `api/scripts.ts`, `api/workspaces.ts` (inclui projetos/diretórios),
  `api/processes.ts`, `api/git.ts`, `api/tests.ts`, `api/rails.ts` (inclui banco de dados),
  `api/activities.ts`, `api/settings.ts`.
- `api.ts` (859 → 9 linhas) virou um barrel (`export * from './api/...'`) — os ~20 arquivos que
  importam `from '../api'`/`from './api'` continuam funcionando sem alteração.
- Já existia um `apps/web/src/api/` com `git-workspace.ts` (sync/tracking de branch remoto), anterior
  a esta fase — confirma que o diretório `api/` como convenção de split já tinha precedente no repo;
  nenhum conflito de nome com os novos arquivos.
- Importações internas usam caminho relativo sem extensão (`from './core'`), diferente do padrão
  `NodeNext` da API (`from './core.js'`) — `apps/web` usa `moduleResolution: "Bundler"`.
- Verificação: `npm run typecheck`, `npm run build` e `npm test` passam no monorepo inteiro (240
  testes da API, 163 do frontend) sem nenhuma mudança de comportamento.

### Fase 3 — CSS flat grandes (baixo risco) — concluída

- `styles/components.css` (2921 → 8 linhas): dividido pelas seções já demarcadas por comentário em
  `styles/components/{dashboard,project-details,project-panels,navigation,activity,processes,git-diff}.css`.
  `dashboard.css` cobre o primeiro bloco genérico (botões, alerts, lista de projetos, cards);
  `project-panels.css` agrupa os blocos pequenos de Git/banco/migrations/Bundler/scripts do painel
  de detalhe do projeto, que tinham comentário próprio mas eram pequenos demais para virar arquivo
  individual.
- `database-layout-polish.css` (1961 → 9 linhas): sem comentários de seção, dividido por bloco de
  seletor em `database/{header,metrics,overview,detail-panel,tables,inspector-mutation,
  empty-states,responsive}.css`, cortando sempre em linhas em branco fora de qualquer regra.
- `scripts-explorer-redesign.css` (1496 → 6 linhas): mesma técnica, em
  `scripts-explorer/{header,overview,catalog,executions,responsive}.css`.
- `project-tests-redesign.css` (838 → 6 linhas): mesma técnica, em
  `project-tests/{header,config,result,log-shell,ready-state,responsive}.css`.
- Cada arquivo original virou um `@import` na mesma ordem relativa do conteúdo original — o hash do
  CSS final gerado pelo `vite build` ficou **idêntico** ao de antes da divisão
  (`index-CfvOI6sP.css`), confirmando que o conteúdo compilado não mudou um byte.
- `apps/web/test/css-architecture.test.ts` e `apps/web/test/database-layout-polish.test.ts` /
  `scripts-explorer-redesign.test.ts` liam o conteúdo bruto de `components.css` /
  `database-layout-polish.css` / `scripts-explorer-redesign.css` diretamente — foram ajustados para
  seguir os `@import` e concatenar os arquivos importados antes de aplicar as mesmas asserções (sem
  reduzir cobertura, só deixando de depender de tudo estar num único arquivo).
- `project-tests-redesign.css` não tinha teste próprio; nenhuma mudança de teste foi necessária ali.
- Verificação: `npm run typecheck`, `npm run build` e `npm test` passam no monorepo inteiro (163
  testes do frontend, incluindo os três arquivos de teste ajustados) sem nenhuma mudança de
  comportamento.

### Fase 4 — Componentes `.vue` grandes (risco médio)

- Sub-etapa 1 (concluída): extrair `<style scoped>` para um arquivo irmão via
  `<style scoped src="./NomeDoComponente.css">` (suportado nativamente pelo compilador de SFC do
  Vue). Feito em `ProjectLogsPanel.vue` (1640 → 865 linhas), `ProjectServerPanel.vue` (1423 → 854),
  `ProjectGitPanel.vue` (1289 → 915), `ProjectGitDiffPage.vue` (1281 → 656),
  `ProjectGitBranchesPage.vue` (736 → 327) e `views/ProjectDetailsView.vue` (760 → 400).
  `ProjectScriptsPanel.vue` e `ProjectDatabasePanel.vue` não tinham `<style>` próprio (já usavam só
  CSS global) — nada a extrair ali.
  - O hash `data-v-xxxxxxxx` gerado pelo compilador muda ao mover o style para `src` (é derivado de
    como o Vue trata o bloco, não do conteúdo), mas continua **auto-consistente**: o mesmo hash novo
    aparece tanto no HTML renderizado quanto no CSS compilado, então o escopo do CSS continua
    funcionando de forma idêntica. Nenhum teste depende do valor do hash. Verificado com
    `npm run typecheck`, `npm run build`, `npm test` (163 testes) e `npm run test:e2e` (13 testes,
    incluindo o baseline visual da sidebar) — tudo passando.
- Sub-etapa 2 (em andamento): extrair grupos coesos do `<script setup>` para composables, um
  componente por vez, com o smoke E2E rodando a cada um.
  - `ProjectLogsPanel.vue` (674 linhas, script ~250 → ~90): extraído
    `composables/useProjectLogsPolling.ts` (244 linhas) com o polling de log
    (`refreshLogs`/`scheduleLogPolling`/`stopLogPolling`/`clearLogView`/`toggleStream`) e seu
    próprio rastreio de gerações de requisição, seguindo o mesmo formato de
    `useProjectProcessStatus.ts` (função-fábrica que recebe `getProject` e devolve refs/funções).
    O componente manteve os filtros de busca/categoria/view-mode e a formatação de exibição (que são
    puramente de UI, não de rede).
    - Um detalhe de ordenação importa aqui: o composable precisa ter **seu próprio** watcher
      imediato de `getProject().id` chamando `reset()` antes do watcher de `hasManagedProcess` que
      dispara o primeiro `refreshLogs`/agendamento — na mesma ordem relativa que existia no
      componente original. Delegar esse reset para um watcher externo no componente (declarado
      depois da chamada do composable) inverteria a ordem e cancelaria a busca inicial assim que ela
      começasse. Por isso o composable é autocontido, como `useProjectProcessStatus`, em vez de
      expor um `reset()` para o componente chamar.
  - `ProjectServerPanel.vue` (854 → 731 linhas): extraídos dois composables independentes,
    `composables/useProjectServerLogPreview.ts` (144 linhas, preview de log sem follow/scroll/clear
    — só refresh/schedule) e `composables/useProjectServerActivities.ts` (88 linhas, atividade
    recente do servidor). Diferente de `ProjectLogsPanel`, este componente também tem
    settings/start/stop/restart fortemente acoplados por um único `RequestGeneration` compartilhado
    (`isCurrentProject`) — essa parte **não** foi extraída nesta passada: início/parada/reinício do
    servidor e persistência de porta são a lógica de negócio central do painel, e dividir isso
    aumentaria o risco sem reduzir tanto o tamanho. A extração ficou só nos dois blocos read-only
    (log preview e atividade), que já não dependiam do `RequestGeneration` compartilhado das ações.
    - `refreshServerSettings`/`persistServerSettings`/`handleStart`/`handleStop`/`handleRestart`/
      `resetPanelState`/`initializeProject` continuam no componente, chamando as funções expostas
      pelos dois composables (`refreshLogs`, `scheduleLogPolling`, `refreshActivities`) nos mesmos
      pontos em que já eram chamadas antes (o watcher de `processStatus` que dispara notificações e
      as três ações de processo).
  - `ProjectDatabasePanel.vue` (871 → 661 linhas): dividido em cinco composables independentes, um
    por domínio de dado — `useProjectDatabaseOverview.ts` (101 linhas: ambientes, revelar URL,
    iniciar banco), `useRailsMigrations.ts` (152 linhas: migrations + detalhe + as mutações
    migrate/rollback/seed/prepare, que só se aplicam a migrations), `useRailsModels.ts` (58 linhas),
    `useRailsRoutes.ts` (66 linhas, exporta também a função pura `routeKey`) e `useRailsBundler.ts`
    (58 linhas). Diferente dos painéis de servidor/logs, aqui não há polling — cada composable é só
    um "one-shot load" com um contador de geração simples (`let generation = 0`, sem as classes
    `RequestGeneration`/`RequestGate`), e todos são independentes entre si (nenhum depende do estado
    de outro), o que tornou a divisão mais direta. O componente manteve apenas estado de UI (seção
    ativa, filtros de busca por aba) e helpers de formatação puros; `refreshAll`/`refreshActive`
    viraram só orquestradores que chamam as funções `load*` expostas por cada composable.
    - Um teste (`database-layout-polish.test.ts`) verificava `fetchProjectRailsMigrationDetail`/
      `fetchProjectRailsModels` diretamente no texto do componente — ajustado para verificar nos
      composables correspondentes, mesmo padrão já usado nos ajustes de teste das fases 1 e 3.
  - `ProjectScriptsPanel.vue` (1004 → 747 linhas): dividido em `useScriptCatalog.ts` (102 linhas:
    catálogo, filtros origem/risco/busca com debounce, paginação) e `useScriptExecution.ts`
    (265 linhas: execução, acompanhamento via SSE com reconexão e backoff, histórico, cancelamento).
    Diferente dos demais, aqui os dois composables **compartilham duas referências passadas por
    parâmetro** em vez de serem totalmente independentes: `activeSection` (troca de aba disparada
    tanto por `selectScript` quanto por `run`/`selectHistory`) e `errorMessage` (um único banner de
    erro no template, escrito tanto por falhas de catálogo quanto de execução — motivo pelo qual não
    virou um `ref` interno de cada composable, e sim um parâmetro compartilhado, do mesmo jeito que
    `hasManagedProcess` foi compartilhado entre os dois composables do `ProjectServerPanel`).
    `selectedActionId` também é passado do composable de catálogo para o de execução pela mesma
    razão (`run()` escreve nele).
    - Um teste (`scripts-explorer-redesign.test.ts`) verificava `prepareScriptExecution`/
      `followScriptExecutionEvents`/`cancelScriptExecution`/a checagem de risco diretamente no texto
      do componente — ajustado para verificar em `useScriptExecution.ts`.
  - `ProjectGitPanel.vue` (1173), `ProjectGitDiffPage.vue` (784) e `ProjectGitBranchesPage.vue`
    (400): avaliados após a reforma funcional da `main` (ver merge abaixo) e **decidido não
    extrair composables** nesta rodada:
    - `ProjectGitBranchesPage.vue` virou puramente apresentacional no merge (recebe
      `overview`/`workspace` via props, emite eventos — não chama API própria). Já está num
      tamanho razoável e coeso; não há mais um composable "de dados" para extrair.
    - `ProjectGitPanel.vue` é o orquestrador central do painel: ~12 funções `run*` (branch, sync,
      commit, stash, mutação de arquivo, PR) compartilhando um único `mutationRunning`/
      `mutationMessage`/`mutationErrorMessage` com guarda de execução única. É a lógica de negócio
      central do painel, na mesma categoria do start/stop/restart não extraído em
      `ProjectServerPanel` — só que maior e mais entrelaçado; sem uma fronteira limpa entre
      leitura e mutação que justifique o risco.
    - `ProjectGitDiffPage.vue` tem uma extração plausível (`loadOverview`/`selectFile`/
      `loadSnapshot`/`refresh`), mas fortemente acoplada a `scope`/`selectedPath`, que também
      dirigem navegação por teclado e larguras de painel persistidas. Fica registrado como
      candidato futuro se o arquivo crescer mais, não como pendência ativa.

**Merge com `main` (task 043 — URL de pull request no painel Git):** a `main` avançou em paralelo
com uma entrega funcional grande (`git-pull-request-service`, `git-file-mutations`, um novo
`ProjectGitCommitPage.vue`, reforma de `ProjectGitPanel.vue`/`ProjectGitSyncPage.vue`) que tocou os
três arquivos já mexidos pela sub-etapa 1 (`ProjectGitPanel.vue`, `ProjectGitDiffPage.vue`,
`ProjectGitBranchesPage.vue`) e os pontos de extensão de `response-schemas.ts`/`api.ts`/
`routes/projects.ts` já quebrados nas fases 1–2. Resolução: para os três `.vue`, em vez de
mesclar manualmente hunk a hunk, o conteúdo de `main` (autoridade sobre lógica/template/estilo) foi
tomado por inteiro e a extração mecânica do `<style scoped>` foi refeita em cima dele — mais seguro
que tentar reconciliar duas versões de um `<style>` grande. Para os módulos já divididos
(`response-schemas/git.ts`, `api/git.ts`, `routes/git-mutations.ts`), as adições de `main`
(`gitPullRequestUrlResponseSchema`, as funções de mutação de arquivo do `api.ts`, os operators
`discard-file`/`remove-untracked-file` no endpoint compartilhado de confirmação) foram inseridas no
arquivo de domínio correspondente. Um teste novo trazido pela `main`
(`git-file-confirmation-route.test.ts`) registrava `projectRoutes` diretamente para bater no
endpoint `/git/mutations/confirmations` — que a fase 1 já tinha movido para `gitMutationRoutes`;
ajustado para registrar o plugin certo. Verificado com `typecheck`, `build`, os 174 testes
unitários (todos os workspaces) e os 13 testes E2E depois do merge.

### Fase 5 — Camada "enhancer" (risco médio — decisão registrada)

Decisão: por ora, **só quebrar mecanicamente**, sem migrar o padrão para dentro dos componentes
Vue.

- Dentro de cada `*-enhancer.ts`, separar `renderX()`, estado e wiring de eventos em módulos
  menores no mesmo diretório, mantendo a única função pública `installX()` como fachada — sem mudar
  o padrão vanilla-DOM em si.
- Migrar o padrão inteiro para lógica reativa dentro dos componentes Vue (eliminando o patch
  pós-render) fica registrado como alternativa mais profunda, fora de escopo deste plano — reavaliar
  como decisão arquitetural separada se a camada "enhancer" continuar crescendo.

**`git-history-page-enhancer.ts` (1130 → 351 linhas) — concluído**, primeiro arquivo da fase.
Diferente das fases anteriores, aqui quase todas as ~40 funções compartilham um único
`WeakMap<HTMLElement, HistoryPageState>` (`stateBySection`) — não dá para cortar por bloco
independente, foi preciso rastrear a fundo quem chama quem. Split em `git-history/`:
`types.ts` (interfaces + `HistoryCommitKind`/`GitHistoryCommit` exportados), `state.ts` (o
`WeakMap` compartilhado), `list-width.ts` (redimensionamento da lista, independente), `dom-helpers.ts`
(`projectIdFromLocation`/`mountIcon`/`requestJson`), `filters.ts` (`filterHistoryCommits`/
`uniqueHistoryAuthors`, testados diretamente), `format.ts` (datas/status), `toolbar.ts` (filtros de
referência/autor/métricas), `list.ts` (linhas da lista + `closeDetail`) e `detail.ts` (patch,
detalhe do commit, `selectCommit`). O arquivo principal ficou só com o bootstrap
(`buildPage`/`buildPagination`/`buildMetric`/`loadHistory`/`enhanceHistory`/`scan`/
`installGitHistoryPageEnhancer`) e re-exporta `GitHistoryCommit`, `HistoryCommitKind`,
`filterHistoryCommits`, `uniqueHistoryAuthors` e `clampHistoryListWidth` para não quebrar
`git-history-page-enhancer.test.ts`, que importa esses nomes diretamente do arquivo.
- `list.ts` e `detail.ts` têm um import circular real (`commitRow` em `list.ts` chama
  `selectCommit` de `detail.ts`; `selectCommit`/`renderDetail`/`renderDetailError` em `detail.ts`
  chamam `closeDetail`/`renderList` de `list.ts`) — seguro em ESM porque são só `function`
  (hoisted) chamadas dentro de handlers de evento, nunca avaliadas no topo do módulo.
- Processo de verificação: como esse tipo de transcrição manual é propenso a erro de cópia (e de
  fato cometi 3 durante a extração — um `require()` indevido, um placeholder de ícone esquecido e
  uma linha inventada em vez de `relativeDate`), cada função foi conferida com `diff` contra o
  arquivo original linha a linha antes de seguir para o typecheck. Verificado com `typecheck`,
  `build` (CSS/JS praticamente idênticos), os 174 testes unitários (incluindo o teste que importa
  `clampHistoryListWidth`/`filterHistoryCommits`/`uniqueHistoryAuthors` direto do arquivo) e os 13
  testes E2E.
**`git-stash-enhancer.ts` (872 → 249 linhas) — concluído**, segundo arquivo da fase. Mesmo padrão:
um único `WeakMap<HTMLElement, StashPageState>` (`stateBySection`) compartilhado por quase todas as
funções. Nenhum teste importa símbolos diretamente deste arquivo (confirmado via grep antes de
começar), então não houve necessidade de re-exports de compatibilidade. Split em `git-stash/`:
`types.ts` (interfaces + `StashOperation`), `state.ts` (o `WeakMap`), `dom-helpers.ts`
(`projectIdFromLocation`/`mountIcon`/`requestJson`), `format.ts` (`formatDate`/`relativeDate`/
`statusLabel`), `notice.ts` (`setNotice`/`persistAndReload`/`readPersistedNotice`, com a chave de
`sessionStorage`), `controls.ts` (`refreshControls`/`renderMetrics`, habilitação de botões conforme
estado), `actions.ts` (`prepareConfirmation`/`runCreate`/`runStashMutation`, as três mutações que
persistem aviso e recarregam a página), `list.ts` (`stashListItem`/`renderList`) e `detail.ts`
(`patchView`/`renderDetailLoading`/`renderEmptyDetail`/`detailAction`/`renderDetail`/`selectStash`).
O arquivo principal ficou só com o bootstrap (`loadStashes`/`metricCard`/`buildStashPage`/
`isStashSection`/`enhanceStash`/`scan`/`installGitStashEnhancer`).
- Mesmo import circular real entre `list.ts` e `detail.ts` do arquivo anterior:
  `stashListItem` (`list.ts`) chama `selectStash` (`detail.ts`); `selectStash` (`detail.ts`) chama
  `renderList` (`list.ts`). Seguro pelo mesmo motivo (funções `function`, hoisted, só invocadas
  dentro de handlers).
- Mesmo processo de verificação por `diff` linha a linha contra o arquivo original antes do
  typecheck. Desta vez cometi 2 erros de transcrição, ambos pegos antes de rodar qualquer
  verificação: um ícone placeholder inventado (`ArchiveBoxIconPlaceholder` em vez de
  `ArchiveBoxIcon`, faltando também o import) em `list.ts`, e uma função `refreshControlsAfterSelect`
  inventada em `detail.ts` em vez de importar e chamar `refreshControls` de `controls.ts`.
- Verificado com `typecheck`, `build` (CSS/JS idênticos ao original), os 174 testes unitários e os
  13 testes E2E — todos verdes na branch `claude/reorganizar-arquitetura-arquivos-fase5b` (criada a
  partir da `main` já com o merge da fase 1, commit `2221475`, após o PR #94 ser mesclado).
**`git-summary-history-enhancer.ts` (686 → 228 linhas) — concluído**, terceiro arquivo da fase.
Mesmo padrão de `WeakMap<HTMLElement, SummaryState>` (`stateBySection`) compartilhado. Nenhum teste
importa símbolos diretamente deste arquivo (confirmado via grep — só `main.ts` importa o instalador).
Split em `git-summary-history/`: `types.ts`, `state.ts`, `dom-helpers.ts`
(`projectIdFromLocation`/`mountIcon`/`requestJson`/`currentBranchFromSection`), `format.ts`
(`formatDate`/`relativeDate`/`statusLabel`), `list.ts` (`commitListItem`/`renderPagination`/
`renderHistoryList`/`setHistoryLoading`) e `detail.ts` (`patchView`/`setDetailLoading`/
`renderCommitDetail`/`renderDetailError`/`selectCommit`/`closeCommitDetail`). O arquivo principal
ficou só com o bootstrap (`loadHistoryPage`/`buildPagination`/`watchCurrentBranch`/`buildHistory`/
`enhanceSummary`/`scan`/`installGitSummaryHistoryEnhancer`) — `buildPagination` e
`watchCurrentBranch` ficaram no principal (não em `list.ts`) porque seus handlers de clique/mutação
chamam `loadHistoryPage`, que por sua vez pertence ao bootstrap, espelhando a mesma decisão tomada
para `buildPagination` em `git-history-page-enhancer.ts`.
- Mesmo import circular real entre `list.ts` e `detail.ts` dos dois arquivos anteriores:
  `commitListItem` (`list.ts`) chama `selectCommit` (`detail.ts`); `selectCommit`/`closeCommitDetail`
  (`detail.ts`) chamam `renderHistoryList` (`list.ts`).
- Mesmo processo de verificação por `diff` linha a linha contra o arquivo original antes do
  typecheck — desta vez sem erros de transcrição (todas as ~24 funções bateram na primeira
  tentativa). Um cuidado extra aqui: como o arquivo principal já havia sido sobrescrito antes da
  verificação, foi preciso recuperar o conteúdo original com `git show HEAD:<arquivo>` para comparar
  contra ele, em vez de reler do disco.
- Verificado com `typecheck`, `build` (CSS idêntico, JS a 1 byte de diferença de nome de chunk),
  os 174 testes unitários e os 13 testes E2E — todos verdes.
**`git-inline-file-diff-enhancer.ts` (486 → 71 linhas) — concluído**, quarto arquivo da fase.
Diferente dos três anteriores, este arquivo não tem um `WeakMap` de estado compartilhado — é
majoritariamente funções puras de renderização mais uma configuração estática
(`configurations: DetailConfiguration[]`) reutilizada em todo `enhanceDetail`/`scanDetails`. Por
isso a quebra seguiu um critério diferente: por responsabilidade de renderização, não por dono do
estado. Split em `git-inline-file-diff/`: `types.ts` (`DiffViewMode`/`DetailConfiguration`),
`configurations.ts` (a lista estática dos 3 containers Git suportados: resumo, histórico, stash),
`dom-helpers.ts` (`mountIcon`), `storage.ts` (`readViewMode`/`persistViewMode`/`rawPatchOf`/
`TARGET_FILE_KEY`), `diff-render.ts` (`unifiedView`/`splitView`/`emptyView`, puras, sem DOM externo),
`viewer.ts` (`renderViewer`, o painel de diff de um arquivo) e `full-diff.ts`
(`enhanceFullDiff`/`updateFullDiffLabel`, o diff combinado dentro do `<details>`). `detail.ts` reúne
`pathsFromRow`/`enhanceDetail`/`scanDetails` — este último é importado diretamente por
`git-inline-file-diff-enhancer.test.ts` (confirmado via grep antes de começar), então o arquivo
principal precisou re-exportá-lo (`export { scanDetails } from './git-inline-file-diff/detail'`),
igual ao padrão de re-export já usado para `git-history-page-enhancer.ts`. O arquivo principal ficou
só com `commitFilePath`/`rememberCommitFile`/`openRememberedDiffFile`/`scan`/
`installGitInlineFileDiffEnhancer` (a lógica de "lembrar qual arquivo estava aberto ao navegar para
a aba Diff", que não pertence a nenhum dos módulos de renderização).
- Sem import circular aqui — ao contrário dos três arquivos anteriores, a ausência de estado
  compartilhado permite uma ordem de dependência estritamente linear (`types` → `configurations`/
  `dom-helpers`/`storage` → `diff-render` → `viewer`/`full-diff` → `detail` → arquivo principal).
- Mesmo processo de verificação por `diff` contra o original antes do typecheck — sem erros de
  transcrição desta vez (2 falsos positivos do script de extração automática por causa de
  assinaturas de função com tipos de retorno/parâmetro multilinhas, resolvidos com verificação
  manual por `sed`).
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários
  (incluindo o teste que importa `scanDetails` direto do arquivo) e os 13 testes E2E — todos
  verdes.
**`git-summary-global-search-fix.ts` (646 → 141 linhas) — concluído**, quinto arquivo da fase e o
maior de todos os enhancers (maior até que `git-history-page-enhancer.ts` original). Mesmo padrão
de `WeakMap<HTMLElement, SummarySearchState>` (`stateBySection`), mais uma particularidade: uma
variável de módulo solta `let summaryFetch: typeof window.fetch | undefined` (fora do `WeakMap`,
usada para permitir injeção de fetch em testes/observabilidade) atribuída dentro de
`installGitSummaryGlobalSearchFix`. Como bindings `let` importados são somente leitura no módulo
que importa, essa variável foi movida para `network.ts` junto com `requestJson`, e a atribuição
direta virou uma função `setSummaryFetcher()` chamada pelo arquivo principal — a única mudança que
não é uma cópia literal nesta quebra, registrada aqui explicitamente. Split em
`git-summary-global-search-fix/`: `types.ts`, `dom-helpers.ts`
(`projectIdFromLocation`/`mountIcon`), `format.ts` (`formatDate`/`relativeDate`/`statusLabel`),
`url.ts` (`buildSummaryHistorySearchUrl`, testado diretamente por
`git-summary-global-search-fix.test.ts` — confirmado via grep antes de começar, único símbolo
testado), `network.ts` (`requestJson`/`setSummaryFetcher`), `state.ts` (`stateBySection`/
`stateFor`), `snapshot.ts` (`captureOriginal`/`restoreOriginal`, o mecanismo que restaura a lista
original do resumo quando a busca global é limpa), `pagination.ts` (`setPagination`) e `list.ts`/
`detail.ts` (mesmo par circular dos arquivos anteriores: `resultRow`/`renderResults`/
`setSearchLoading`/`closeSearchDetail` em `list.ts` chamando `selectResult` de `detail.ts`, que por
sua vez chama `renderResults`/`closeSearchDetail` de volta). O arquivo principal ficou com
`loadSearchPage`/`resetForBranchChange`/`enhanceSection`/`scan`/
`installGitSummaryGlobalSearchFix`, além de reexportar `buildSummaryHistorySearchUrl`.
- Mesmo processo de verificação por `diff` linha a linha contra o original antes do typecheck —
  sem erros de transcrição; os únicos dois diffs não-`OK` foram o `export` esperado e a mudança
  documentada de `summaryFetch = ...` para `setSummaryFetcher(...)`.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários
  (incluindo o teste que importa `buildSummaryHistorySearchUrl` direto do arquivo) e os 13 testes
  E2E — todos verdes.
**`log-visual-enhancer.ts` (402 → 53 linhas) — concluído**, sexto arquivo da fase e o primeiro sem
`WeakMap` — o estado compartilhado aqui é uma única variável de módulo solta,
`let activeSearchQuery = ''`, lida por praticamente toda função do arquivo (para destacar o termo
buscado e marcar `enhanced-search-match`). Como bindings `let` importados são somente leitura fora
do módulo que os declara (mesma limitação encontrada em `git-summary-global-search-fix.ts`), a
variável ficou em `log-visual/search.ts` junto com `appendHighlightedText` (a única função que
já morava no mesmo escopo dela no arquivo original), exportando um getter/setter
(`getActiveSearchQuery`/`setActiveSearchQuery`). Toda referência direta à variável nas demais
funções virou uma chamada ao getter — a única mudança que não é cópia literal, e a mesma stakepoint
já usada para `summaryFetch`/`setSummaryFetcher`. Split em `log-visual/`: `constants.ts`
(`enhancedAttribute`/`originalTextAttribute`/`sqlKeywords`/`sqlFunctions`), `dom-helpers.ts`
(`text`/`rememberOriginalText`), `search.ts` (a variável + `appendHighlightedText`),
`line-decorators.ts` (`isErrorMessage`/`renderPlainLine`/`decorateRawLine`, a classificação de
linhas de log brutas: boot, sucesso, build, requisição HTTP, erro, warning), `sql.ts`
(`sqlTokenClass`/`appendSqlStatement`/`decorateSqlLine`, o destaque de sintaxe SQL) e
`render-line.ts` (`decorateRenderLine`, linhas "Rendering/Rendered" do Rails) e `rails-cards.ts`
(`highlightPlainElement`/`decorateRailsCards`). O arquivo principal ficou com
`enhance`/`refreshSearchQuery`/`installLogVisualEnhancer`.
- Verificação adaptada para essa mudança: em vez de `diff` byte a byte puro, cada função foi
  comparada contra uma cópia do original com `s/activeSearchQuery/getActiveSearchQuery()/g`
  aplicado via `sed` antes do `diff` — confirmando que a única diferença real era a
  substituição mecânica da variável pelo getter, nunca uma mudança de lógica. As duas funções que
  atribuem a variável (`refreshSearchQuery`/`installLogVisualEnhancer`) foram conferidas
  manualmente por não caberem nesse padrão de substituição (viram chamadas a `setActiveSearchQuery`).
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes. Nenhum teste importa símbolos diretamente deste arquivo.
**`git-commit-enhancer.ts` (362 → 42 linhas) — concluído**, sétimo arquivo da fase e o segundo sem
`WeakMap`/variável de módulo compartilhada — cada função aqui é independente, ligada apenas por
argumentos explícitos (`section`, `branch`, `counts`), o que tornou esta a quebra mais direta até
agora. Três funções são puras e testadas diretamente por `git-commit-enhancer.test.ts`
(`classifyGitStatus`, `matchesCommitFile`, `withCommitPrefix` — confirmado via grep antes de
começar) e precisaram ser reexportadas pelo arquivo principal. Split em `git-commit/`: `types.ts`
(`CommitFileKind`/`CommitFileFilter`), `constants.ts` (`conventionalTypes`), `dom-helpers.ts`
(`mountIcon`), `classify.ts` (`classifyGitStatus`/`matchesCommitFile`), `commit-prefix.ts`
(`withCommitPrefix`), `tabs.ts` (`findTab`), `heading.ts` (`addPageHeading`), `files.ts`
(`enhanceFiles`, o filtro/busca da lista de arquivos alterados) `message-editor.ts`
(`branchType`/`messageEditor`, os chips de tipo de commit sugeridos pela branch) e `composer.ts`
(`enhanceComposer`, a alternância entre os formulários "commit staged"/"salvar tudo"). O arquivo
principal ficou só com `enhanceCommitPage`/`scan`/`installGitCommitEnhancer`, além de reexportar
as três funções testadas e os dois tipos.
- Sem import circular e sem transformação de estado compartilhado desta vez — todas as funções
  bateram no `diff` linha a linha contra o original sem nenhum erro de transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários
  (incluindo o teste que importa as três funções puras direto do arquivo) e os 13 testes E2E —
  todos verdes.
**`sql-explanation-enhancer.ts` (326 → 42 linhas) — concluído**, oitavo arquivo da fase e o mais
simples até agora: nenhum `WeakMap`, nenhuma variável de módulo, nenhum import circular — apenas
funções puras de parsing de SQL (regex sobre a string do statement) encadeadas por argumentos e
retorno, sem tocar o DOM exceto em `buildExplanation`. Nenhum teste importa símbolos deste arquivo
diretamente (confirmado via grep — só `main.ts` importa o instalador). Split em `sql-explanation/`:
`types.ts` (`SqlExplanation`), `constants.ts` (`SQL_LINE_SELECTOR`/`EXPLANATION_CLASS`),
`text-helpers.ts` (`cleanIdentifier`/`code`/`unique`), `extract.ts` (`extractStatement`/
`extractMainTable`/`extractJoinedTables`/`extractLimit`/`extractOrder`/`selectProjection`/
`hasSoftDeleteFilter`/`hasWhere`, todo o parsing de SQL bruto por regex), `describe.ts`
(`describeSelect`/`explainSql`, a montagem da explicação em português a partir do que foi
extraído) e `render.ts` (`explanationKey`/`buildExplanation`, a montagem do `<details>` exibido
abaixo da linha de log). O arquivo principal ficou só com `enhanceSqlLine`/`enhance`/
`installSqlExplanationEnhancer`.
- Todas as 18 funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
**`log-detail-enhancer.ts` (291 → 41 linhas) — concluído**, nono arquivo da fase, também sem
`WeakMap`/variável de módulo/import circular — cada linha de log é decorada de forma independente
lendo o estado da busca direto do DOM a cada chamada (`searchQuery()`), sem cache entre chamadas.
Split em `log-detail/`: `constants.ts` (`RAW_LINE_SELECTOR`/`SEARCH_INPUT_SELECTOR`/
`sqlKeywords`/`sqlFunctions`), `types.ts` (`NodeRequest`/`QueryParameter`), `dom-helpers.ts`
(`searchQuery`/`originalText`/`appendHighlightedText`), `node-request.ts`
(`parseNodeRequest`/`parseRequestTarget`/`buildParameters`/`decorateNodeRequest`, o parse de query
string de requisições Node/Next) e `sql.ts` (`sqlTokenClass`/`appendSql`/`splitRawSql`/
`decorateRawSql`, o destaque de sintaxe de linhas SQL brutas do log). O arquivo principal ficou só
com `enhanceLine`/`enhance`/`installLogDetailEnhancer`.
- Armadilha encontrada durante a extração: duas `renderKey` usam `\u0000` como separador dentro de
  um template literal (`` `${value}\u0000${query}` ``). Ao transcrever o conteúdo via ferramenta,
  a sequência de escape virou um byte NUL de verdade no arquivo novo (detectável porque `grep`
  passou a reportar "binary file matches") em vez do texto literal `\u0000` que o TypeScript
  original interpreta como escape em tempo de execução — corrigido reescrevendo o byte NUL de volta
  para os seis caracteres literais antes de seguir. Vale nota para qualquer futura extração
  manual que envolva escapes Unicode em template literals.
- Fora esse ponto, todas as funções bateram no `diff` linha a linha contra o original (os dois
  falsos-negativos do script de extração automática, por assinatura de retorno multilinha,
  resolvidos com verificação manual por `sed`).
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
**`git-summary-inline-diff-fix.ts` (290 → 23 linhas) — concluído**, décimo arquivo da fase. Sem
`WeakMap` nem variável de módulo — o `mode` de visualização (unificado/lado a lado) é lido do
`localStorage` a cada abertura de arquivo, não fica em memória entre chamadas. Este arquivo é um
dos "irmãos" citados na nota de duplicação entre enhancers (ver seção "Duplicação entre os
enhancers" mais abaixo neste documento) — tem lógica quase idêntica à de
`git-inline-file-diff-enhancer.ts`, mas é um enhancer separado específico para o painel de resumo
(`git-summary-commit-detail`), então a quebra foi feita isoladamente, sem tentar unificar os dois
(fora de escopo desta fase). Split em `git-summary-inline-diff-fix/`: `types.ts` (`ViewMode`),
`dom-helpers.ts` (`mountIcon`), `storage.ts` (`readMode`/`saveMode`), `diff-render.ts`
(`unified`/`split`, incluindo os helpers privados `prefix`/`number`/`splitCell`), `paths.ts`
(`filePaths`) e `enhance.ts` (a função `enhance` inteira, mantida como um único bloco porque as
closures `open`/`draw`/`close` compartilham variáveis locais como `active`/`mode` de forma
entrelaçada — separá-las exigiria introduzir um objeto de estado explícito, fora do escopo de uma
quebra puramente mecânica). O arquivo principal ficou só com `scan`/
`installGitSummaryInlineDiffFix`.
- Todas as funções (incluindo os helpers privados de `diff-render.ts`) bateram no `diff` linha a
  linha contra o original sem nenhum erro de transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
**`test-log-tone-enhancer.ts` (286 → 39 linhas) — concluído**, décimo primeiro arquivo da fase.
Sem `WeakMap` nem variável de módulo compartilhada — cada linha é classificada de forma pura por
regex, sem estado entre chamadas. Seis símbolos são importados diretamente por consumidores
externos: `classifyTestLogLine` (teste), `classifyTestLogSemanticTone`/`enhanceTestLogTones`/
`isTestLogErrorLine` (teste) e `classifyTestLogSemanticTone`/`isTestLogErrorLine`/
`isTestLogWarningLine` (`composables/project-test-log.ts`, um consumidor interno, não só teste) —
confirmado via grep antes de começar, todos reexportados pelo arquivo principal. Split em
`test-log-tone/`: `constants.ts` (as classes de tom e os regex `RSPEC_PROGRESS_PATTERN`/
`TEST_FILE_PATTERN`), `types.ts` (`TestLogVisualTone`/`TestLogSemanticTone`), `classify.ts`
(`normalizedLine` — exportado porque `row.ts` também precisa dele —, `hasNonZeroFailureSummary`,
`isTestLogSuccessLine`/`isTestLogErrorLine`/`isTestLogWarningLine`,
`classifyTestLogSemanticTone`/`classifyTestLogLine`), `dom-helpers.ts` (`toggleExclusiveClass`),
`row.ts` (`decorateRspecProgress`/`enhanceRow`) e `shell.ts`
(`tabButton`/`setTabCount`/`renderSemanticEmptyInspector`/`enhanceShell`). O arquivo principal
ficou só com `enhanceTestLogTones`/`installTestLogToneEnhancer`, além dos reexports.
- Segundo erro de transcrição real da fase (o primeiro foi no `git-stash-enhancer.ts`): a função
  `normalizedLine` original usa `value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')` para remover
  códigos de escape ANSI — na primeira cópia, o `\u001B` (o caractere ESC que abre a sequência)
  foi descartado por engano, o que teria feito o regex remover colchetes `[...]` de qualquer
  linha em vez de só sequências ANSI. Pego por inspeção antes do `diff` de verificação, comparando
  contra o original linha a linha.
- Repetição da armadilha de escape Unicode já vista em `log-detail-enhancer.ts`: ao corrigir o
  `\u001B`, a ferramenta de escrita novamente converteu a sequência de escape em um byte ESC (0x1B)
  real embutido no arquivo, em vez do texto literal `\u001B` que o TypeScript original interpreta
  em tempo de execução — corrigido reescrevendo o byte de volta para os seis caracteres literais.
  Vale registrar como padrão recorrente: qualquer extração manual que precise digitar uma sequência
  de escape Unicode dentro de uma regex ou template literal deve ter o arquivo resultante
  verificado com uma contagem de bytes de controle (`\x00`, `\x1b`, etc.) antes do `diff`, não só
  depois.
- Fora esses dois pontos, todas as ~16 funções bateram no `diff` linha a linha contra o original.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários
  (incluindo os dois arquivos de teste que importam símbolos direto deste módulo) e os 13 testes
  E2E — todos verdes.
**`git-history-inline-diff-fix.ts` (262 → 22 linhas) — concluído**, décimo segundo arquivo da
fase e "irmão" quase idêntico de `git-summary-inline-diff-fix.ts` (mesma nota de duplicação entre
enhancers) — a única diferença de comportamento é o seletor alvo (`.git-history-page-detail`/
`.git-history-page-detail-files`/`.git-history-page-diff pre` em vez dos equivalentes
`.git-summary-*`) e o fato de já ler `patch.dataset.rawPatch` em vez de só `patch.textContent`.
Mesma estrutura de módulos em `git-history-inline-diff-fix/`: `types.ts` (`ViewMode`),
`dom-helpers.ts` (`mountIcon`), `storage.ts` (`readMode`/`saveMode`), `diff-render.ts`
(`unified`/`split` + helpers privados `prefix`/`number`/`splitCell`), `paths.ts` (`filePaths`) e
`enhance.ts` (a função `enhance` mantida como bloco único pelo mesmo motivo do arquivo irmão).
Arquivo principal só com `scan`/`installGitHistoryInlineDiffFix`.
- Nenhum teste importa símbolos deste arquivo diretamente (confirmado via grep).
- Todas as funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
- Com este arquivo concluído, todos os enhancers com >250 linhas listados originalmente no
  levantamento da fase foram quebrados.

**`git-history-global-search-fix.ts` (223 → 109 linhas) — concluído**, décimo terceiro arquivo da
fase — este tinha ficado de fora do levantamento inicial de arquivos >250 linhas, mas seguia o
mesmo padrão dos demais e valia a quebra. Mesmo padrão de `WeakMap<HTMLElement, HistorySearchState>`
(`stateBySection`). A função `applyGlobalHistoryFilters` é testada diretamente por
`git-history-global-search-fix.test.ts` (confirmado via grep) e foi reexportada. Split em
`git-history-global-search-fix/`: `types.ts` (`CompatibleTimer`/`HistorySearchState`/
`HistoryResponsePayload`), `dom-helpers.ts` (`historySection`/`control`), `state.ts`
(`stateBySection`/`stateFor`), `url.ts` (`isHistoryListRequest`/`applyGlobalHistoryFilters`/
`requestUrl`/`replaceRequestUrl`, a reescrita de URL que redireciona `/git/commits` para
`/git/exclusive-branch-commits` com os filtros aplicados) e `controls.ts`
(`restoreControls`/`scheduleRestore`). O arquivo principal ficou com `refresh`/`enhanceSection`/
`scan`/`installGitHistoryGlobalSearchFix` — este último é o maior remanescente porque contém o
monkey-patch de `window.fetch` inteiro, que não fazia sentido fatiar mais sem obscurecer o fluxo de
uma única requisição interceptada.
- Todas as funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários
  (incluindo o teste que importa `applyGlobalHistoryFilters` direto do arquivo) e os 13 testes
  E2E — todos verdes.
**`git-diff-compact-enhancer.ts` (195 → 39 linhas) — concluído**, décimo quarto arquivo da fase.
Sem `WeakMap`; a única variável de módulo (`let scheduled = false`) fica no arquivo principal
porque só é lida/escrita por `scan`/`scheduleScan`, que também ficaram lá. A função
`splitLeadingPatchMetadata` é testada diretamente por `git-diff-compact-enhancer.test.ts`
(confirmado via grep) e foi reexportada junto com o tipo `LeadingPatchMetadata`. Split em
`git-diff-compact/`: `types.ts` (`DiffSummaryMetric`/`LeadingPatchMetadata`), `summary.ts`
(`metricValue`/`appendSummaryMetric`/`updateCompactSummary`, o resumo compacto de branch+métricas
no cabeçalho), `filters.ts` (`totalFileCount`/`updateFilters`, oculta o filtro de status quando há
só um arquivo) e `patch-metadata.ts` (`splitLeadingPatchMetadata`/`leadingMetadataRows`/
`updatePatchMetadata`, que move linhas de metadado do patch para um `<details>` recolhível).
Arquivo principal com `enhancePage`/`scan`/`scheduleScan`/`installGitDiffCompactEnhancer`.
- Todas as funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários
  (incluindo o teste que importa `splitLeadingPatchMetadata` direto do arquivo) e os 13 testes
  E2E — todos verdes.
**`git-branch-delete-enhancer.ts` (193 → 28 linhas) — concluído**, décimo quinto arquivo da fase.
Sem `WeakMap`; a única variável de módulo (`scheduled`) fica no arquivo principal, mesmo padrão do
arquivo anterior. Nenhum teste importa símbolos deste arquivo diretamente (confirmado via grep).
Split em `git-branch-delete/`: `types.ts` (`ConfirmationResponse`/`DeleteResponse`),
`dom-helpers.ts` (`projectIdFromLocation`/`mountIcon`), `network.ts` (`requestJson`),
`panel-info.ts` (`selectedBranch`/`isLocalBranch`/`isCurrentBranch`/`protectionReason`/
`refreshBranches`, a leitura de estado do painel de branch e a proteção contra remover a branch
atual ou `main`/`master`) e `enhance.ts` (`enhancePanel`, mantida como um único bloco porque o
handler de clique assíncrono compartilha `button`/`status`/`branch` por closure, mesmo critério
usado nos dois arquivos `*-inline-diff-fix` anteriores). Arquivo principal com `scan`/
`installGitBranchDeleteEnhancer`.
- Todas as funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
**`project-header-server-enhancer.ts` (155 → 64 linhas) — concluído**, décimo sexto arquivo da
fase. Diferente de todos os anteriores, o estado compartilhado aqui são três variáveis de módulo
soltas (`activeProjectId`/`refreshTimer`/`requestGeneration`) lidas e escritas tanto por
`loadServerStatus` quanto por `synchronize` — por isso essas duas funções e a variável ficaram
juntas no arquivo principal, em vez de forçar um getter/setter só para permitir a extração (o
padrão usado em `git-summary-global-search-fix.ts`/`log-visual-enhancer.ts` quando só uma função
precisava mutar o estado; aqui duas precisam, então mantê-las juntas é mais simples e igualmente
correto). Split em `project-header-server/`: `types.ts`
(`ManagedProcessSnapshot`/`ProcessResponse`), `dom-helpers.ts`
(`projectIdFromLocation`/`serverPath`), `status.ts` (`statusDescription`) e `indicator.ts`
(`ensureIndicator`/`updateIndicator`, a montagem e atualização do indicador de servidor no
cabeçalho do projeto). Arquivo principal com as três variáveis de estado, `loadServerStatus`,
`synchronize` e `installProjectHeaderServerEnhancer`.
- Nenhum teste importa símbolos deste arquivo diretamente (confirmado via grep).
- Todas as funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
**`git-diff-syntax-enhancer.ts` (110 → 42 linhas) — concluído**, décimo sétimo arquivo da fase.
Duas `WeakMap` independentes (`sourceByPatch`/`stateByCode`), uma por tipo de elemento decorado
(`<pre>` de patch vs. `<code>` de linha individual) — sem relação entre si, cada uma fica isolada
no módulo que a usa. Nenhum teste importa símbolos deste arquivo diretamente (confirmado via
grep). Split em `git-diff-syntax/`: `constants.ts` (`PATCH_SELECTOR`/`CODE_SELECTOR`), `state.ts`
(as duas `WeakMap`), `patch.ts` (`looksLikePatch`/`enhancePatch`) e `code.ts`
(`syntaxContext`/`enhanceCode`, que monta a chave de cache `` `${filePath}\u0000${query}\u0000${source}` ``
— mesma armadilha de escape Unicode das duas extrações anteriores, desta vez evitada de propósito
escrevendo um placeholder de texto e substituindo por bytes exatos via script Python em vez de
digitar o escape diretamente na ferramenta de edição). Arquivo principal com `scan`/
`closestFromMutationTarget`/`installGitDiffSyntaxEnhancer`.
- Todas as funções bateram no `diff` linha a linha contra o original sem nenhum erro de
  transcrição, incluindo o escape Unicode preservado corretamente.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.
**`git-icon-enhancer.ts` (76 → 43 linhas) e `git-diff-page-enhancer.ts` (73 → 25 linhas) —
concluídos**, décimo oitavo e décimo nono arquivos, encerrando a Fase 5. Diferente de todos os
anteriores, esses dois já eram pequenos e coesos antes da quebra (uma única responsabilidade cada:
montar ícones em abas/indicadores; montar e desmontar um componente Vue numa seção legada) — a
divisão foi feita a pedido explícito do usuário para completar 100% da camada "enhancer", não por
necessidade estrutural (foi sinalizado antes de prosseguir). `git-icon-enhancer.ts` foi dividido em
`git-icon/`: `constants.ts` (`iconByLabel`) e `dom-helpers.ts` (`mountIcon`) — arquivo principal com
`enhanceGitIcons`/`installGitIconEnhancer`. `git-diff-page-enhancer.ts` foi dividido em
`git-diff-page/`: `state.ts` (`mountedApps`, o `Map<HTMLElement, App>` das instâncias Vue
montadas), `dom-helpers.ts` (`projectIdFromLocation`/`isLegacyDiffSection`) e `lifecycle.ts`
(`enhanceDiffSection`/`cleanup`, montagem e desmontagem da instância) — arquivo principal com
`scan`/`installGitDiffPageEnhancer`.
- Todas as funções de ambos os arquivos bateram no `diff` linha a linha contra o original sem
  nenhum erro de transcrição.
- Verificado com `typecheck`, `build` (CSS idêntico, JS estável), os 174 testes unitários e os 13
  testes E2E — todos verdes.

**Fase 5 encerrada.** Todos os 19 arquivos da camada "enhancer" vanilla-DOM (`*-enhancer.ts`/
`*-fix.ts`) foram quebrados mecanicamente em módulos por responsabilidade, do maior
(`git-history-page-enhancer.ts`, 1130 linhas) ao menor (`git-diff-page-enhancer.ts`, 73 linhas),
sem nenhuma mudança de comportamento. O padrão vanilla-DOM em si não foi alterado — migrar para
lógica reativa dentro dos componentes Vue continua fora de escopo, registrado como decisão
arquitetural separada no início desta fase.

### Fase 6 — `packages/process-manager/src/process-manager.ts` (risco mais alto)

**Etapa 1 — funções livres (1430 → 1070 linhas) — concluída.** Extraídas todas as funções sem
estado de instância que precediam a classe, em quatro módulos novos (imports com extensão `.js`,
padrão `NodeNext` deste pacote):

- `errors.ts` — `ProcessManagerErrorCode`/`ProcessManagerError` (movidos da posição original) e
  `isErrnoException`. O `index.ts` do pacote continua importando `ProcessManagerError` de
  `./process-manager.js`, que agora reexporta de `./errors.js` — nenhum consumidor em `apps/api`
  (12 arquivos usam o erro via `@dev-dashboard/process-manager`) precisou mudar.
- `state-directory.ts` — `resolveStateDirectory` (respeita `DEV_DASHBOARD_STATE_DIR` e
  `XDG_STATE_HOME`).
- `port-utils.ts` — `SERVER_BIND_HOST`, `validatePort`, `isIpv4Family` (privado),
  `listServerUrls`, `canConnect`, `canListen`, `findAvailablePort`.
- `command-resolution.ts` — `ResolvedCommand` (exportado), `PackageManifest`/`NodePackageManager`/
  `pathExists`/`readPackageManifest`/`resolveNodePackageManager`/`resolveNodeCommand`/
  `resolveRailsCommand` (privados) e `resolveServerCommand` (exportado, único ponto de entrada que
  a classe usa) — o equivalente TS de `lib/server/core/start.sh` citado no CLAUDE.md fica agora num
  módulo próprio.

O arquivo principal manteve, além da classe: `terminalProcess` e `waitForProcessExit` (funções
livres, mas usadas exclusivamente pelo ciclo de vida da classe — movê-las não reduziria
acoplamento), os tipos `StartServerOptions`/`ReadServerLogOptions`/`ObservedExit`/`ManagedKind`, e
os reexports de compatibilidade. A classe `ProcessManager` inteira foi verificada por `diff` contra
o original — **zero bytes alterados** no corpo da classe; todas as funções extraídas também
bateram byte a byte (processo de verificação idêntico ao da Fase 5).

Verificação: `npm run build`/`npm run test` do pacote (42 testes, incluindo o teste de timing
historicamente flaky, que passou), `npm run typecheck`/`npm run build`/`npm test` do monorepo
completo (249 API, 174 web, todos os pacotes) e os 13 testes E2E — todos verdes.

**Etapa 2 — concluída (1070 → 157 linhas).** Os métodos acoplados a estado privado foram divididos
por responsabilidade, substituindo `this.<campo>` por um objeto de contexto (`ProcessStoreContext
= { processDirectory, logDirectory }`) e factories que fecham sobre seu próprio estado — mesmo
espírito das factories já usadas em `createExitTracker`/`createProcessLifecycle` abaixo, só que
aplicado à classe inteira em vez de um método isolado:

- **`process-store.ts`** (175 linhas) — persistência em disco pura: `createProjectKey`,
  `resolveLogFile`, `resolveProcessFile`, `readStoredProcess`, `writeStoredProcess`,
  `listStoredProcessEntries` (o loop de `readdir` que antes vivia dentro de `listProcesses`) e
  `terminalProcess` (função livre que já estava solta no topo do arquivo original). Nenhuma dessas
  funções sabe nada sobre processo vivo ou tracking de saída — só formato de arquivo.
- **`process-exit-tracking.ts`** (236 linhas) — os dois `Map` (`observedExits`, `exitWaiters`) que
  antes eram campos da classe agora vivem dentro de `createExitTracker(context)`, uma factory que
  devolve `{ observeChild, waitForObservedExit, waitForManagedExit, clearObservedExit }`. Inclui
  também `waitForProcessExit` (função livre já existente) e `recordChildExit` (privada à factory,
  chamada só por `observeChild`) — este módulo não importa nada de `process-store.ts` além dos
  tipos e das duas funções de persistência que precisa (`readStoredProcess`/`writeStoredProcess`),
  recebidas via o mesmo `context` compartilhado.
- **`process-status.ts`** (138 linhas) — não estava no desenho original desta fase; extraído à
  parte porque `getManagedProcess`/`listProcesses` (a reconciliação entre o `.json` salvo e o
  processo do SO de fato) não pertence nem à persistência pura nem ao ciclo de vida start/stop —
  depende dos dois: lê/escreve via `process-store.ts` e consulta `exitTracker.waitForObservedExit`/
  `clearObservedExit`. Fábrica `createProcessStatusReader(context, exitTracker)`.
- **`process-lifecycle.ts`** (402 linhas, acima da meta de ~200 — ver nota abaixo) — start/stop de
  fato: `startManagedServer` (`startServerLocked`), `startManagedTest` (`startTestLocked`),
  `stopManagedProcess`, `sendSignal`. Fábrica `createProcessLifecycle(context, exitTracker,
  statusReader)` — `statusReader` é usado só para a checagem "já está rodando?" no início de cada
  start; `stopManagedProcess` lê o processo via `readStoredProcess` puro (sem reconciliação), igual
  ao comportamento original — atenção que vale registrar: era tentador chamar
  `statusReader.getManagedProcess` também aqui por simetria, mas isso teria mudado o comportamento
  (a versão original de `stopManagedProcess` nunca reconciliava o status antes de tentar parar).
- **`process-logs.ts`** (156 linhas) — `readManagedLog`/`clearManagedLog` (antes `readLog`/
  `clearLog`), leitura/limpeza de arquivo de log com mascaramento, sem nada de processo.
- **`process-manager.ts`** (orquestrador, 157 linhas) — a classe `ProcessManager` continua
  exportada com o mesmo nome, construtor e todos os métodos públicos com a mesma assinatura; cada
  um vira uma chamada de uma linha para as factories acima. `withStartLock` continua na classe (é
  concorrência do próprio `ProcessManager`, não pertence a nenhum módulo de domínio).

Nota sobre `process-lifecycle.ts` ficar acima da meta de ~200 linhas: `startManagedServer` e
`startManagedTest` compartilham a mesma estrutura (sweep → checar processo em andamento → `mkdir` →
abrir log → `spawn` → persistir → observar saída), mas com detalhes suficientemente diferentes
(resolução de porta/comando só no server; `CI=true` só no teste) que uma função genérica
parametrizada teria ficado menos legível que as duas versões concretas lado a lado — mesmo
trade-off já registrado para `git-summary-inline-diff-fix.ts`/`git-history-inline-diff-fix.ts` na
Fase 5 (arquivos "irmãos" que não foram unificados). Registrado como candidato a nova subdivisão
futura (`process-lifecycle/server.ts` + `process-lifecycle/test.ts` + `process-lifecycle/stop.ts`)
se o arquivo crescer mais, não como pendência ativa agora.

Verificação: `npm run typecheck`, `npm run build` e `npm test` do monorepo completo (os 42 testes
do pacote `process-manager`, incluindo o teste de timing historicamente flaky, mais 321 da API, 248
do frontend e os demais pacotes) — todos verdes, sem nenhuma mudança de comportamento.

### Fase 7 — reinventário (pós Fase 6 etapa 1 + crescimento por features)

Levantamento novo de todos os arquivos acima de 400 linhas no monorepo hoje, feito depois de várias
entregas funcionais na aba Banco de dados (tasks 056–060) e na aba Diff (task 058). Alguns arquivos
já tocados nas fases 4/5 voltaram a crescer por causa de funcionalidade nova, não porque a extração
anterior foi desfeita — por exemplo `ProjectGitDiffPage.vue` ficou em 656 linhas ao final da Fase 4,
mas está em 871 agora depois de a task 058 substituir o enhancer legado por um componente Vue mais
completo direto no arquivo.

```
 885  apps/web/src/components/ProjectLogsPanel.vue            [Fase 4 já fez sub-etapa 1+2; reavaliar]
 871  apps/web/src/components/ProjectGitDiffPage.vue          [cresceu de novo pós task 058; reavaliar]
 823  apps/web/src/components/ProjectGitHistoryPage.vue
 605  apps/web/src/components/ProjectScriptsPanel.vue
 574  apps/api/src/services/git-service.ts                      [já dividido nesta fase; classe ainda acima de 400, ver nota abaixo]
 743  apps/web/src/components/ProjectDatabasePanel.vue        [Fase 4 já extraiu 5 composables; cresceu por tasks 056-060]
 683  apps/web/src/views/ActivityView.vue
 565  apps/api/src/services/script-execution-service.ts                [já dividido nesta fase; classe ainda acima de 400]
 629  apps/web/src/components/ProjectGitPanel.vue
 627  apps/web/src/components/ProjectReadmePanel.vue
 611  apps/web/src/components/ProjectGitBranchesPage.vue
 593  apps/web/src/views/ProcessesView.vue
 590  apps/web/src/components/ProjectServerPanel.vue
 588  apps/web/src/components/NoticeCenter.vue
 573  apps/web/src/components/ProjectGitPullRequestPage.vue
 571  apps/web/src/views/DashboardView.vue
 539  apps/web/src/components/CommandPalette.vue
 467  apps/web/src/stores/dashboard.ts
 434  apps/web/src/composables/useProjectTestsPanel.ts
 404  apps/web/src/components/ProjectTestsGuidedPanel.vue
```

Regra geral desta fase é a mesma das anteriores (refatoração pura, sem mudar assinatura pública,
~200 linhas por arquivo novo como meta). Diferença de processo: para os arquivos já quebrados antes
(`ProjectLogsPanel.vue`, `ProjectDatabasePanel.vue`, `ProjectGitDiffPage.vue`), o primeiro passo é
reler o que já foi extraído nas Fases 4/5 e decidir se o crescimento novo cabe num composable já
existente ou pede um novo, em vez de repetir a análise do zero. Sem plano detalhado arquivo a
arquivo ainda — mesmo formato das fases anteriores, mapeado em lotes conforme a execução avança.

**`apps/api/src/services/git-service.ts` (842 → 574 linhas) — concluído**, primeiro arquivo desta
fase. Mesmo padrão de extração de funções livres já usado nas fases anteriores — a diferença é que
aqui a maior parte das ~500 linhas é o corpo da classe `GitService` em si (16 métodos públicos de
mutação/leitura), então a redução foi menor proporcionalmente que em `process-manager.ts`. Split em
`git-service/`: `errors.ts` (`GitDiffError`/`GitMutationError`/`GitMutationErrorCode`/
`StoredMutationConfirmation`), `constants.ts` (limites, padrões de regex, separadores de log —
atenção ao registrar `LOG_SEPARATOR`/`RECORD_SEPARATOR` como texto literal `'\u001f'`/`'\u001e'`,
não como byte de controle cru, mesma armadilha já documentada na Fase 5), `run.ts` (`runGit`/
`commandFailureText`), `status-parsing.ts` (`parseStatus`/`parseCommits`/`statusFromCode`),
`diff-helpers.ts` (`resolveDiffBase`/`gitDiffArgs`/`parseNumstat`/`ensurePathInsideProject`/
`readIndexBlob`/`readWorkingTreeFile`), `mutation-guards.ts` (as validações antes de cada mutação:
`assertWorkingTreeClean`/`requireRepository`/`validateBranchName`/`validateMutationPath`/
`ensureMutationPathInsideProject`/`requireOriginRemote`/`validateCommitMessage`), `save-prefix.ts`
(`resolveSavePrefix`) e `stash.ts` (`listStashEntries`). Todos os nomes que já eram exportados no
nível do módulo (inclusive os não usados fora do arquivo hoje, como `GIT_BRANCH_NAME_PATTERN`)
continuam reexportados de `git-service.ts`, preservando a API pública do módulo por completo.
`git-service.ts` fica só com a classe `GitService`. Candidato a nova subdivisão futura (dividir a
própria classe por domínio — branch/arquivo/commit/stash — como foi feito com `ProcessManager` na
Fase 6) se o arquivo crescer mais; não foi feito agora porque a classe é coesa em torno de um único
`Map` de confirmações compartilhado por todas as mutações. Verificado com `typecheck`, `build` e os
54 testes de `git-service`/`git-service-mutations`/`git-service-diff`/`git-amend-all-changes`/
`git-file-confirmation-route`, mais o monorepo completo (248 testes web) — todos verdes.

**`apps/api/src/routes/tests.ts` (666 → 19 linhas) — concluído**, segundo arquivo desta fase.
Plugin único registrando 9 rotas relacionadas a execução de testes; dividido por sub-domínio em
`routes/tests/`: `helpers.ts` (tipos, schemas de params/query, `requireProject`, os três mapeadores
de erro e `serializeTestExecutionEvent`), `process-routes.ts` (overview, processo, logs get/delete,
stop — 5 rotas), `command-routes.ts` (iniciar comando, listar arquivos, iniciar arquivo — 3 rotas),
`history-routes.ts` (histórico get/delete) e `events-route.ts` (o endpoint SSE de
acompanhamento, isolado à parte por ser a rota mais densa e sem schema JSON — usa `reply.hijack()`
diretamente). O arquivo principal ficou só com o plugin Fastify chamando os 4 `registerX(app,
options)`. Único símbolo exportado (`testRoutes`) continua no mesmo lugar. Verificado com
`typecheck`, `build` e os 24 testes de `test-events-route`/`test-file-routes`/`routes`, mais o
monorepo completo (248 testes web) — todos verdes.

**`apps/api/src/services/script-execution-service.ts` (660 → 565 linhas) — concluído**, terceiro
arquivo desta fase. Mesma situação de `git-service.ts`: a classe `ScriptExecutionService` concentra
6 `Map`s privados compartilhados por quase todos os métodos (`executions`/`activeProjects`/
`confirmations`/`pendingWrites`/`subscribers`/`eventTimers`) — dividir os métodos exigiria o mesmo
tipo de refatoração por contexto explícito feita em `process-manager.ts` (Fase 6), que não foi
tentada aqui para manter esta passada como extração pura de funções livres, igual ao que já tinha
sido validado em `git-service.ts`. Split em `script-execution/`: `errors.ts`
(`ScriptExecutionErrorCode`/`ScriptExecutionError`), `constants.ts` (limites, TTL, padrão do UUID
de execução), `command-resolution.ts` (`resolveNodeManager`/`resolveCommand`, o equivalente
específico de scripts ao `resolveServerCommand` de `process-manager`) e `auth.ts` (`tokensMatch`,
comparação de token em tempo constante). `ScriptExecutionError`/`ScriptExecutionErrorCode`
continuam reexportados do arquivo principal — únicos símbolos consumidos fora do módulo, junto com
a própria classe. Candidato a nova subdivisão futura igual ao `GitService`. Verificado com
`typecheck`, `build` e os 18 testes de `script-execution-service`/`script-events-route`, mais o
monorepo completo — todos verdes (um teste de timing historicamente flaky em
`packages/process-manager` falhou uma vez e passou limpo na repetição, sem relação com este split).

**`apps/api/src/services/rails-inspection-service.ts` (649 → 331 linhas) — concluído**, quarto
arquivo desta fase. Ao contrário de `git-service.ts`/`script-execution-service.ts`, aqui a classe em
si é pequena (~270 linhas) — a maior parte do arquivo eram parsers e helpers livres antes dela, sem
nenhum estado compartilhado entre eles. Split em `rails-inspection/`: `errors.ts`
(`RailsMutationErrorCode`/`RailsMutationError`), `constants.ts` (limites, TTLs, catálogo fechado de
tipos de campo do generator), `command-resolution.ts` (`resolveRailsCommand`/`pathExists`/
`defaultCommandRunner`, o equivalente Rails de `resolveServerCommand`), `databases.ts`
(`listDatabases`, a detecção de bancos secundários via `db/*_schema.rb`), `generator.ts`
(`buildGeneratorArgs`/`parseGeneratorCreatedFiles`), `migrations-parsing.ts`
(`migrationsDirectory`/`parseMigrationStatusBlocks`/`matchMigrationStatusBlock`),
`routes-parsing.ts` (`parseRoutes`) e `schema-parsing.ts` (`parseSchema` e seus 5 helpers privados
de leitura de opção/singularização). O arquivo principal ficou só com a classe
`RailsInspectionService` e `StoredMutationConfirmation` (usada só internamente).
`RailsMutationError`/`RailsMutationErrorCode` continuam reexportados. Verificado com `typecheck`,
`build` e os 33 testes de `rails-inspection-service`/`rails-routes`, mais o monorepo completo —
todos verdes.

**`apps/api/src/services/git-pull-request-service.ts` (604 → 339 linhas) — concluído**, quinto
arquivo desta fase. Mesmo padrão de `rails-inspection-service.ts`: a classe
`GitPullRequestService` é relativamente pequena (~280 linhas), a maior parte do arquivo eram
funções livres antes dela. Split em `git-pull-request/`: `errors.ts`
(`GitPullRequestErrorCode`/`GitPullRequestError`), `run.ts` (`runGit`/`runProviderCli`/
`optionalGit`), `branch-context.ts` (`requireRepository`/`currentBranch`/`publishedReference`/
`remoteUrl`/`defaultBranch`/`requireBaseBranch`), `remote-parsing.ts` (`parseRemoteUrl`/
`detectProvider`), `url-compose.ts` (`composeGithubUrl`/`composeGitlabUrl`) e
`github-lookup-payload.ts` (`asRecord`/`githubRepositoryParts`/`githubLookupFromPayload`). Um
detalhe que não existia nas divisões anteriores: `ResolvedPullRequestContext` (o tipo que carrega
branch/remoto/provider já resolvidos) é consumido tanto pela classe principal quanto por
`github-lookup-payload.ts` — em vez de declará-lo em um dos dois e criar uma dependência cruzada,
foi para um `context.ts` próprio (junto com `GitPullRequestTargetRemote`), do qual ambos importam.
Verificado com `typecheck`, `build` e os 15 testes de `git-pull-request-service`/
`git-pull-request-status-service`/`git-pull-request-targets`, mais o monorepo completo — todos
verdes.

**`apps/api/src/routes/processes.ts` (600 → 17 linhas) — concluído**, sexto arquivo desta fase.
Mesmo padrão de `routes/tests.ts`: plugin único registrando 9 rotas, dividido por sub-domínio em
`routes/processes/`: `helpers.ts` (tipos, schemas, `requireProject`, os dois mapeadores de erro e
`processEnvelopeResponseSchema`), `server-settings-routes.ts` (GET/PUT `server-settings` — 2 rotas),
`server-process-routes.ts` (processo/logs/start/stop do servidor de um projeto — 5 rotas) e
`process-list-routes.ts` (listagem global `/processes` com filtro por workspace/kind e
`/processes/cleanup`). Único símbolo exportado (`processRoutes`) continua no mesmo lugar. Verificado
com `typecheck`, `build` e os 26 testes de `processes-route`/`process-cleanup`/`server-config`/
`routes`, mais o monorepo completo — todos verdes.

**`apps/api/src/services/test-detection-service.ts` (587 → 118 linhas) — concluído**, sétimo
arquivo desta fase. Divisão por origem de detecção (mesmo critério de
`packages/project-discovery`): `errors.ts` (`TestFileErrorCode`/`TestFileError`), `types.ts`
(`ResolvedCommand`/`DetectedTestCommand`, compartilhados por todos os detectores), `fs-helpers.ts`
(`pathExists`), `node-detection.ts` (`detectNodeCommands` e seus helpers privados de
package.json/lockfile), `rails-detection.ts` (`detectRailsCommands`), `python-detection.ts`
(`detectPythonCommands`) e `file-scan.ts` (`findTestFiles`/`ensureTestPathInsideProject`/
`composeFileCommand`/`FILE_TARGET_PATTERNS`, a varredura de arquivos de teste por padrão de nome). O
arquivo principal ficou só com a classe `TestDetectionService` (cache + orquestração dos três
detectores por `project.type`). Verificado com `typecheck`, `build` e os 28 testes de
`test-detection-service`/`test-file-routes`/`related-test-service`, mais o monorepo completo —
todos verdes.

**`apps/api/src/services/git-stash-service.ts` (573 → 287 linhas) — concluído**, oitavo arquivo
desta fase. Split em `git-stash/`: `errors.ts` (`GitStashErrorCode`/`GitStashError`),
`constants.ts` (separador de campo, TTL, limite de patch, os dois regex — mesma atenção de sempre
ao `FIELD_SEPARATOR` como texto literal `'\u001f'`, não byte cru), `run.ts` (`runGit`/
`failureText`), `validation.ts` (`validateReference`/`validateCreateInput`),
`repository-guards.ts` (`requireRepository`/`requireCleanWorkingTree`/`currentBranch`/
`rollbackWorkingTree`), `status-parsing.ts` (`parseNameStatus`/`parseNumstat`) e
`reference-parsing.ts` (`parseSubject`/`parseReferences`/`includesUntracked`/`filesFor`/
`summaryFor`, que já dependem de `status-parsing.ts`). O arquivo principal ficou só com a classe
`GitStashService`. Verificado com `typecheck`, `build` e o teste de `git-stash-service`, mais o
monorepo completo — todos verdes.

**`apps/api/src/services/git-commit-details-service.ts` (519 → 249 linhas) — concluído**, nono
arquivo desta fase e o primeiro sem nenhuma classe — só funções livres exportadas diretamente
(`listBranchCommits`/`listCurrentBranchCommits`/`inspectGitCommit`/`inspectGitCommitFile`), sem
estado compartilhado, o que tornou a divisão direta. Split em `git-commit-details/`: `types.ts` (os
8 tipos/interfaces exportados), `errors.ts` (`GitCommitDetailsError`), `constants.ts` (separadores,
limites, os dois regex e `HISTORY_FORMAT`), `run.ts` (`runGit`/`requireRepository`),
`file-status-parsing.ts` (`parseNameStatus`/`parseNumstat`) e `history-parsing.ts`
(`parseHistory`/`filterHistory`/`hasHistoryFilters`/`resolveHistoryReference`). O arquivo principal
ficou só com as 4 funções de serviço. Verificado com `typecheck`, `build` e os 12 testes de
`git-commit-details-service`/`git-current-branch-history-service`/
`git-exclusive-branch-history-service`, mais o monorepo completo — todos verdes.

**`apps/api/src/services/database-snapshot-service.ts` (471 → 329 linhas) — concluído**, décimo
arquivo desta fase. Split em `database-snapshot/`: `errors.ts`
(`DatabaseSnapshotErrorCode`/`DatabaseSnapshotError`), `constants.ts` (retenção, TTL, limite de
tamanho, timeout, os binários de dump/restore por driver), `connection.ts` (`snapshotDriver`/
`connectionFor`/`dumpArguments`/`restoreArguments`/`passwordEnvironment`, a montagem da conexão a
partir do que a detecção já sabe — nunca dados vindos do navegador) e `process-helpers.ts`
(`spawnFailure`/`normalizeLabel`). A classe `DatabaseSnapshotService` (dump/restore via
`spawn`+`pipeline` com gzip, confirmação em duas etapas) fica sozinha no arquivo principal, com
`StoredSnapshot`/`PendingRestore` internos. Verificado com `typecheck`, `build` e os 19 testes de
`database-snapshot-service`/`database-snapshot-routes`, mais o monorepo completo — todos verdes.

**`apps/api/src/services/git-sync-service.ts` (456 → 284 linhas) — concluído**, décimo primeiro
arquivo desta fase. Mesmo padrão dos outros serviços Git: `errors.ts`
(`GitSyncErrorCode`/`GitSyncError`), `constants.ts` (TTL, constantes de "sincronizar main", os três
regex), `run.ts` (`runGit`/`failureText`), `validation.ts`
(`validateReference`/`validateStrategy`) e `repository-guards.ts` (as 7 checagens de pré-condição:
repositório/referência remota/remote configurado/branch local/HEAD destacado/árvore limpa/abortar
operação). A classe `GitSyncService` fica sozinha no arquivo principal. Verificado com `typecheck`,
`build` e os 4 testes de `git-sync-service`, mais o monorepo completo — todos verdes.

**`apps/api/src/services/git-undo-service.ts` (404 → 220 linhas) — concluído**, décimo segundo
arquivo desta fase e o último dos serviços "desfazer"/sincronização Git. Split em `git-undo/`:
`errors.ts`, `types.ts` (`GitUndoOperation`/`GitUndoStrategy`/`CommitSummary`/
`GitUndoConfirmation`/`GitUndoCommitResult`), `constants.ts`, `run.ts` (`runGit`/`optionalGit`),
`repository-guards.ts` (`requireRepository`/`currentBranch`/`assertWorkingTreeClean`/
`localAheadOfUpstream`), `commit-helpers.ts` (`headCommit`, que usa o `parseCommit` interno) e
`file-helpers.ts` (`ensurePathInsideProject`/`renameInfo`/`pathExistsInHead`/`unlinkIfPresent`). A
classe `GitUndoService` fica sozinha no arquivo principal. Verificado com `typecheck`, `build` e os
5 testes de `git-undo-service`, mais o monorepo completo — todos verdes.

**`apps/api/src/routes/git-workspace.ts` (437 → 17 linhas) — concluído**, décimo terceiro arquivo
desta fase e o primeiro conjunto de rotas depois dos serviços. Split em `routes/git-workspace/`:
`helpers.ts` (tipos, todos os schemas JSON, `findProject`, `translateBranchError`),
`workspace-routes.ts` (GET workspace + POST fetch de remote — 2 rotas) e
`branch-tracking-routes.ts` (as 4 rotas de rastrear/parar de rastrear branch remota). O arquivo
principal ficou só com o plugin Fastify instanciando os dois serviços (`GitWorkspaceService`/
`GitBranchService`) e chamando os 2 registradores. Verificado com `typecheck`, `build` e o
monorepo completo — todos verdes.

**`apps/api/src/routes/rails.ts` (430 → 12 linhas) — concluído**, décimo quarto arquivo desta fase.
Split em `routes/rails/`: `helpers.ts` (tipos, todos os schemas de request/response,
`requireProject`, `translateMutationError`), `read-routes.ts` (as 4 rotas GET de
migrations/migration-detail/models/routes) e `mutation-routes.ts` (as 4 rotas POST de
confirmação/mutação de migration e de generator). Verificado com `typecheck`, `build` e os 12
testes de `rails-routes`, mais o monorepo completo — todos verdes.

**`apps/api/src/routes/projects.ts` (425 → 16 linhas) — concluído**, décimo quinto arquivo desta
fase. Split em `routes/projects/`: `helpers.ts` (tipos, `gitDiffErrorStatus`,
`projectParamsSchema`), `favicon-route.ts` (a busca por favicon em 6 diretórios candidatos, com
ranking de nome preferido — a parte mais densa do arquivo original), `list-routes.ts` (GET
`/projects` + GET `/projects/:projectId`) e `git-diff-routes.ts` (as 4 rotas de overview/diff/
diff-de-arquivo/linhas-de-arquivo). Verificado com `typecheck`, `build` e o monorepo completo —
todos verdes.

**`apps/api/src/routes/git-stash.ts` (423 → 16 linhas) — concluído**, décimo sexto arquivo desta
fase e o último do lado `apps/api/src`. Split em `routes/git-stash/`: `helpers.ts` (tipos, todos os
schemas, `translateStashError`, `projectFor`), `list-detail-routes.ts` (GET lista + GET detalhe) e
`mutation-routes.ts` (confirmação, criar, e o loop `apply`/`pop`/`drop`). Verificado com
`typecheck`, `build` e o monorepo completo — todos verdes.

**`apps/web/src/test-log-inspector.ts` (530 → 29 linhas) — concluído**, décimo sétimo arquivo desta
fase e o primeiro do lado `apps/web`. Mesmo padrão vanilla-DOM já usado nos 19 enhancers da Fase 5
(`WeakMap<HTMLElement, InspectorState>` por shell, `installX()`/`enhanceX()`/`scan` como fachada
pública). Split em `test-log-inspector/`: `types.ts`, `constants.ts` (`ANSI_PATTERN`/
`STACK_PATH_PATTERN`), `state.ts` (o `WeakMap`), `text-helpers.ts` (`cleanLines`/`compact`/
`isErrorText`/`isWarningText`), `log-parsing.ts` (`parseTestLog` e os 5 parsers privados de
falha/resumo/exemplos), `dom-helpers.ts` (`el`/`labelValue`/`collectLog`/`modeFor`/`hidden`/
`updatePressed`), `filters.ts` (`applyFilters`/`toolbarFor`, busca e filtro de linhas),
`failure-detail.ts` (`failureDetail`/`copyFailure`, o painel de detalhe de uma falha),
`inspector-render.ts` (`renderInspector`, a lista+detalhe navegável) e `enhance.ts`
(`enhanceShell`/`enhanceTestLogInspector`, o bootstrap de varredura). O arquivo principal ficou só
com `installTestLogInspector` (o `MutationObserver`) e os reexports (`parseTestLog`/
`enhanceTestLogInspector`/os dois tipos), únicos símbolos consumidos fora do módulo. Atenção
replicada de novo: a assinatura de re-render usa `\u0000` como separador em template literal —
escrita como texto literal de escape, não byte de controle, mesma armadilha das fases anteriores.
Verificado com `vue-tsc` (`typecheck` do workspace web), `build` e os 7 testes de
`test-log-inspector`/`test-log-inspector-mutation-guard`, mais o monorepo completo — todos verdes.

**`apps/web/src/utils/git-diff-view.ts` (493 → 16 linhas) — concluído**, décimo oitavo arquivo
desta fase. Sem estado, sem classe — só tipos e funções puras de renderização de diff, o candidato
mais simples até aqui do lado web. Split em `utils/git-diff-view/`: `types.ts` (os 8 tipos/
interfaces), `constants.ts` (`HUNK_PATTERN`/`WORD_PATTERN`/limiares de diff por palavra),
`parse.ts` (`parseUnifiedGitDiff`), `split-rows.ts` (`buildSplitGitDiffRows`, a view lado-a-lado),
`word-diff.ts` (`computeGitDiffWordRanges`/`annotateGitDiffWordChanges`, a comparação por LCS de
tokens), `html-render.ts` (`highlightGitDiffText`/`renderGitDiffLineHtml`/`countGitDiffMatches`) e
`hunks.ts` (`splitGitDiffHunks`/`buildGitDiffContextLines`, usados pela expansão de contexto do
`ProjectGitDiffPage.vue`). O arquivo principal virou um barrel puro (`export { ... } from
'./git-diff-view/...'`), igual ao padrão já usado em `api.ts`/`response-schemas.ts` nas Fases 1–2 —
nenhum dos 4 consumidores (`GitFileDiffView.vue`, `ProjectGitDiffPage.vue`, e os dois enhancers
`git-summary-inline-diff-fix`/`git-inline-file-diff`) precisou mudar import. Verificado com
`vue-tsc`, `build` e os 22 testes de `git-diff-view`/`git-diff-syntax`, mais o monorepo completo —
todos verdes.

**`apps/web/src/utils/git-syntax-highlight.ts` (461 → 4 linhas) — concluído**, décimo nono arquivo
desta fase. Mesmo espírito de `git-diff-view.ts`: só tipos e funções puras (nenhuma classe, nenhum
estado). Split em `utils/git-syntax-highlight/`: `types.ts` (`GitSyntaxLanguage`/
`SyntaxTokenKind`), `keywords.ts` (o dicionário de palavras-chave por linguagem, o maior bloco de
dados do arquivo original), `language-map.ts` (`gitSyntaxLanguageForPath`, mapa de
extensão/nome-de-arquivo para linguagem), `render-text.ts` (`renderText`/`renderToken`, escape +
`<mark>` de busca), `tokenize-helpers.ts` (`commentMarker`/`quotedEnd`/`nextNonWhitespace`),
`generic-line.ts` (`highlightGenericLine`, o tokenizador principal — maior função do arquivo),
`markup.ts` (`highlightMarkupLine`/`highlightAttributes`, para HTML/ERB/Vue), `markdown.ts`
(`highlightMarkdownLine`), `highlight.ts` (`highlightGitDiffCode`, o dispatcher por linguagem) e
`patch-render.ts` (`highlightGitPatch`). O arquivo principal virou um barrel puro de 4 linhas —
nenhum dos 3 consumidores (`ProjectDatabasePanel.vue`, `git-diff-syntax/code.ts`,
`git-diff-syntax/patch.ts`, este último um enhancer diferente e não relacionado, apesar do nome
parecido) precisou mudar import. Verificado com `vue-tsc`, `build` e os 13 testes de
`git-syntax-highlight`/`git-diff-syntax`, mais o monorepo completo — todos verdes.

## Progresso da Fase 7

`process-manager.ts`, `routes/tests.ts`, `rails-inspection-service.ts`,
`git-pull-request-service.ts`, `routes/processes.ts`, `test-detection-service.ts`,
`git-stash-service.ts`, `git-commit-details-service.ts`, `database-snapshot-service.ts`,
`git-sync-service.ts`, `git-undo-service.ts`, `routes/git-workspace.ts`, `routes/rails.ts`,
`routes/projects.ts`, `routes/git-stash.ts`, `test-log-inspector.ts`, `utils/git-diff-view.ts` e
`utils/git-syntax-highlight.ts` saíram da lista por completo — todo o `apps/api/src` está
concluído (exceto as duas classes ainda acima de 400, ver nota acima). `git-service.ts` (842 → 574) e `script-execution-service.ts` (660 → 565) foram divididos,
mas as duas classes continuam acima de 400 linhas — ficam no inventário como candidatas a uma
segunda passada (dividir a classe por domínio), não como pendência ativa agora. Os demais ~15
arquivos do inventário — todos em `apps/web/src` — seguem pendentes, sem ordem de execução fixada —
a lista completa está na seção "Fase 7" logo acima. Arquivos `.vue` com bastante template
(`ProjectLogsPanel.vue`, `ProjectGitDiffPage.vue`, `ProjectGitHistoryPage.vue` etc.) tendem a ser
mais arriscados de dividir do que serviços/rotas da API — extrair um composable errado pode mudar
timing de watchers, como já registrado na Fase 4 para `ProjectLogsPanel.vue`. Priorizar os arquivos
de `apps/api/src` antes de entrar nos componentes Vue grandes é a ordem recomendada para o restante
desta fase.

## Ordem de execução

Fases 1–3 são puramente mecânicas e de baixo risco — dá para executar em uma única entrega. Fases
4–6 tocam comportamento sensível (logs, testes, processos gerenciados) e devem ser feitas uma de
cada vez, com os testes relevantes rodando a cada passo.

## Paralelização

As fases não dependem umas das outras tecnicamente — a ordem acima é por risco, não por
pré-requisito. Em termos de arquivos tocados:

| Fases | Arquivos que tocam | Conflito entre si? |
|---|---|---|
| 1 (rotas API + response-schemas) | `apps/api/src/routes/*`, `apps/api/src/http/response-schemas.ts` | — |
| 2 (`api.ts` web) | `apps/web/src/api.ts` | Não sobrepõe com 1 (consome a API, não edita rotas) |
| 3 (CSS flat) | `apps/web/src/*.css`, `styles/components.css` | Não sobrepõe com 1, 2, 4, 5, 6 |
| 4 (componentes `.vue`) | um componente por vez, cada um em arquivo próprio | Os componentes entre si não se tocam — vários podem rodar ao mesmo tempo, cada um em uma branch |
| 5 (enhancers) | `apps/web/src/*-enhancer.{ts,css}` | Arquivos próprios, distintos dos CSS da fase 3 e dos componentes da fase 4 |
| 6 (`process-manager.ts`) | `packages/process-manager/` | Pacote isolado, só a API o importa via barrel — não conflita com o resto |

Ou seja: **1, 2, 3, 5 e 6 são totalmente disjuntas em arquivos** e podem ser executadas em paralelo
sem risco de conflito de merge. A fase 4 também paraleliza bem *internamente* (cada componente é
independente dos demais), mas por ser a de maior risco (toca lógica reativa, não só estilo),
prefira um componente por vez dentro dela.

Se a execução for de fato paralela (múltiplas branches/agentes simultâneos), cada frente deve ir
para uma branch/worktree própria e ser mesclada de volta uma a uma — não porque os arquivos
colidem, mas para manter `npm run typecheck && npm test` verde a cada merge, em vez de acumular
várias mudanças não verificadas ao mesmo tempo.

## Fora do escopo (por ora)

- Reescrever a camada "enhancer" para dentro dos componentes Vue (ver Fase 5).
- Qualquer mudança de comportamento visível na UI ou na API.
- Tocar no CLI Bash (`lib/`, `init.sh`) — os módulos de lá já seguem a convenção de três arquivos
  (`init.sh`/`helpers.sh`/verbo) descrita no `CLAUDE.md` e nenhum arquivo lá passa de ~260 linhas.

## Anexo — faixas de linha por arquivo (roteiro para quem executar cada fase)

Levantamento detalhado dos maiores arquivos, para servir de roteiro concreto na hora de executar
cada fase. Números de linha são aproximados (o arquivo muda entre o levantamento e a execução).

### Duplicação entre os "enhancers" (relevante para a Fase 5)

Os cinco arquivos `git-history-page-enhancer.ts`, `git-stash-enhancer.ts`,
`git-summary-history-enhancer.ts`, `git-summary-global-search-fix.ts` e `test-log-inspector.ts`
compartilham a mesma estrutura e várias funções idênticas ou quase idênticas: `mountIcon()`,
`requestJson<T>()`, `patchView()`, `formatDate()`/`relativeDate()`, `statusLabel()`, e o par
`scan(root)` + `installXEnhancer()` para reaplicar o enhancement via `MutationObserver` quando a
navegação client-side troca de página. Nenhum usa `<script setup>`/SFC — são scripts vanilla-DOM
puros que corrigem a página depois que o Vue já renderizou.

Antes de fatiar cada um isoladamente na Fase 5, vale considerar extrair um `dom-enhancer-kit.ts`
compartilhado com esses helpers comuns — reduz duplicação futura, mas é uma decisão à parte da
extração mecânica por arquivo (que já reduz o tamanho individual sem essa unificação).

### CSS grandes — blocos por seletor/comentário

- **`styles/components.css`** (2921 linhas): 1–896 componentes genéricos; 897–1289
  `/* Rotas de detalhes do projeto */`; 1290–1310 `/* Git do projeto */`; 1311–1323
  `/* Banco de dados do projeto */`; 1324–1345 migrations/rotas Rails; 1346–1356 diagnóstico
  Bundler; 1357–1363 scripts/tarefas; 1364–1705 `/* Paleta global de navegação */` (maior bloco
  único); 1706–2386 `/* Painel de atividade */`; 2387–2889 `/* Processos gerenciados */`;
  2890–2901 diff do Git; 2902–2921 mutações do Git.
- **`database-layout-polish.css`** (1961 linhas): 1–33 shell base; 34–262 header/tabs; 263–393
  alerts/métricas; 393–966 overview (environments, preview, health-card, sidebar) — maior bloco;
  965–1300 detail-panel/inspector genérico; 1300–1423 tabelas de dados; 1423–1730
  inspector/mutation/model-detail; 1730–1757 empty states; 1757–1961 `@media` (1180/940/720/
  reduced-motion — se dividir por seção, os breakpoints precisam ir juntos ou virar arquivo
  responsivo à parte).
- **`scripts-explorer-redesign.css`** (1496 linhas): 1–353 header/toolbar; 354–759 overview grid;
  759–1129 catalog-layout (sidebar/detail/paginação); 1129–1334 executions-layout (histórico/log);
  1334–1496 `@media` (1080/820/620/reduced-motion).
- **`project-tests-redesign.css`** (838 linhas): 1–132 heading/execution-flow; 132–296 config
  grid; 296–482 resultado de execução; 482–660 log shell; 660–694 ready-state; 694–838 `@media`.
- **`git-history-page-enhancer.css`** (927 linhas): 1–190 heading/toolbar/métricas; 190–435
  timeline/lista de commits; 435–479 paginação; 479–850 detail panel (maior bloco, ~370 linhas);
  850–927 `@media`.
- **`git-stash-enhancer.css`** (748 linhas): 1–108 heading/notice; 108–351 create-card/navigator/
  lista; 351–539 detail panel; 539–673 diff/patch/estados; 673–748 `@media`.

### Componentes `.vue` — script / template / style

Padrão comum: script relativamente organizado (imports → props → refs → computeds → helpers →
loaders → ações → watchers), mas com `<style scoped>` de 350 a 775 linhas — o alvo mais seguro para
extrair primeiro (Fase 4), sem tocar em lógica.

| Componente | Script | Template | Style | Composable(s) sugerido(s) |
|---|---|---|---|---|
| `ProjectLogsPanel.vue` (1640) | 1–436 | 438–863 | 865–1640 (~775) | `useProjectLogsPolling.ts` (refresh/schedule/stop/clear) |
| `ProjectServerPanel.vue` (1423) | 1–580 | 582–852 | 854–1423 (~570) | `useServerProcessActions.ts`, `useServerLogsPolling.ts`, `useServerActivities.ts` |
| `ProjectGitPanel.vue` (1289) | 1–611 | 613–913 | 915–1289 | `useGitOverview.ts` (loaders read-only) + `useGitMutations.ts` (runMutation/commit/save/stash/sync) |
| `ProjectGitDiffPage.vue` (1281) | 1–335 | 337–654 | 656–1281 (~625, maior bloco — checar duplicação com CSS de diff dos enhancers) | — |
| `ProjectScriptsPanel.vue` (1004) | 1–532 | 534–1004 (sem style próprio) | — | `useScriptCatalog.ts` (load/filtros/histórico) + `useScriptExecution.ts` (run/follow/restore/cancel) |
| `ProjectDatabasePanel.vue` (871) | 1–533 | 535–871 (sem style próprio) | — | `useDatabaseOverview.ts` (loaders) + `useRailsMigrations.ts` (migrations/mutation) |
| `ProjectDetailsView.vue` (760) | 1–135 (orquestrador fino) | 137–398 | 400–760 (~360) | — |
| `ProjectGitBranchesPage.vue` (736) | 1–128 (pequeno) | 130–325 | 327–736 (~410, maior parte do arquivo) | — |

### Scripts "enhancer" — funções por responsabilidade

- **`git-history-page-enhancer.ts`** (1045): tipos+filtros puros e testáveis em 31–188
  (`GitHistoryCommit`, `filterHistoryCommits`, `uniqueHistoryAuthors` → `git-history-filters.ts`);
  helpers de DOM/formatação em 99–225; render de filtros/toolbar 225–347; render de lista/paginação
  347–473; render de detalhe/patch 473–718 (maior bloco); loading de dados 718–772; bootstrap/scan
  772–1045.
- **`git-stash-enhancer.ts`** (866): bootstrap/helpers 90–190; notice/persistência entre reloads
  190–218; render de controles/lista 218–328; render de detalhe 328–491 (maior bloco); ações
  (loadStashes/runCreate/runStashMutation) 491–696; bootstrap de página 696–866.

### API — rotas e schemas

- **`routes/projects.ts`** (685): helpers de favicon 52–150; plugin único registrando, em ordem,
  list/create (~160–185), favicon (~186–225), git overview (~226–259), git diff/file diff
  (~259–411), confirmação de mutação (~411–439), branch/switch/pull/push (~439–545), commit/save
  (~545–601), stash/stash-pop (~601–649), get-by-id (~649–685). As rotas de mutação Git (linhas
  411–649) são as candidatas a mover para `routes/git-mutations.ts` (Fase 1); as de favicon podem
  virar `routes/projects-favicon.ts` se quiser um segundo corte.
- **`routes/tests.ts`** (666): helpers de erro/serialização 92–198 (`processManagerApiError`,
  `testFileApiError`, `serializeTestExecutionEvent`, `requireProject`); rotas de "process"
  (start/stop/logs/events, incluindo SSE em ~609) intercaladas com rotas de "files"/"history" — dá
  para separar em `tests-helpers.ts` + `tests-process-routes.ts`, mantendo o resto no arquivo
  principal.
- **`response-schemas.ts`** (683): já ordenado por domínio no arquivo — erros comuns (1–63),
  scripts (64–139), workspace/project/process (139–265), settings/log/git básico (266–349), tests
  (349–431), git overview + database (431–499), git diff/mutations (499–558), rails (558–655),
  activity (655–683). Split direto em `response-schemas/{common,scripts,workspaces-projects,
  processes,tests,git,rails,activity}.ts` + `index.ts` reexportando tudo.
- **`services/script-execution-service.ts`** (660): tipos/erro 23–161; classe `ScriptExecutionService`
  162–660 com estado/constructor (163–204), subscrição/eventos (205–229, 531–553), confirmação
  (229–255, 379–424), execução (255–283, 349–378, 425–530), consulta (283–349), persistência em
  disco (556–652, extraível como `script-execution-persistence.ts`), utilitários numéricos
  (653–660).

### `packages/process-manager/src/process-manager.ts` (1430 linhas)

Classe única `ProcessManager` (466–1430) após tipos/erros (68–465). Métodos por responsabilidade:
estado/constructor (467–521); leitura de processo/lista (522–658); logs — leitura/limpeza
(659–822); start de servidor (823–961, com `withStartLock`); stop (962–1057); observação de
child/exit tracking (1057–1235, `observeChild`/`waitForObservedExit`/`recordChildExit`); persistência
em disco (1235–1330, `resolveLogFile`/`resolveProcessFile`/`readStoredProcess`/`writeStoredProcess`);
start de teste (1321–1430). Confirma o plano da Fase 6: extrair funções livres sem estado
(`command-resolution.ts`, `port-utils.ts`, `state-directory.ts`) primeiro; os métodos que dependem
de campos privados (`observedExits`, `startLocks`) exigem mais cuidado — provável introduzir um
objeto de estado explícito passado entre módulos.
