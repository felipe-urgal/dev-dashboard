# Plano — quebra de arquivos grandes em módulos menores

## Status

Fases 1, 2, 3 e 4 concluídas (sub-etapa 2 fechada com composables extraídos em 4 dos 7 componentes
grandes; os 3 componentes Git restantes foram avaliados e decidiu-se não extrair, ver detalhes na
Fase 4). Fase 5 em andamento: `git-history-page-enhancer.ts`, `git-stash-enhancer.ts`,
`git-summary-history-enhancer.ts` e `git-inline-file-diff-enhancer.ts` concluídos, demais arquivos
da camada "enhancer" pendentes. Fase 6 ainda é planejamento.

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
- Os demais arquivos da camada (`log-visual-enhancer.ts` 402, etc.) seguem pendentes — cada um
  exige o mesmo processo de rastreio manual de dependências.

### Fase 6 — `packages/process-manager/src/process-manager.ts` (risco mais alto)

- Extrair funções livres, sem estado de instância, para módulos próprios: `command-resolution.ts`
  (Rails/Node), `port-utils.ts`, `state-directory.ts`.
- Métodos que dependem de campos privados da classe (`observedExits`, `startLocks`) são mais
  difíceis de mover sem introduzir um objeto de estado explícito — tratar como sub-tarefa própria,
  rodando a suíte completa (`process-manager.test.ts`, `log-retention.test.ts`) a cada extração.

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
