# Plano — quebra de arquivos grandes em módulos menores

## Status

Planejamento. Nenhuma fase foi executada ainda.

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

### Fase 1 — API (baixo risco, mecânica pura)

- Mover as 8 mutações Git de `routes/projects.ts` para um novo `routes/git-mutations.ts`, seguindo
  a convenção `git-*.ts` já usada pelos demais arquivos de rota Git.
- Quebrar `response-schemas.ts` em `response-schemas/{errors,workspaces-projects,processes,scripts,git,tests,rails,activity}.ts`
  mais um `index.ts` que re-exporta tudo — nenhum import externo muda.

### Fase 2 — `apps/web/src/api.ts` (baixo risco)

- Extrair `requestJson`, bootstrap de sessão e classes de erro para `api/core.ts`.
- Um arquivo por domínio: `api/scripts.ts`, `api/workspaces.ts`, `api/processes.ts`, `api/git.ts`,
  `api/tests.ts`, `api/rails.ts`, `api/activities.ts`, `api/settings.ts`.
- `api.ts` vira um barrel (`export * from './api/...'`) — os ~60 pontos de import existentes
  (`from '../api'`) continuam funcionando sem alteração.

### Fase 3 — CSS flat grandes (baixo risco)

- `components.css` já tem seções demarcadas por comentário (`/* Git do projeto */`,
  `/* Processos gerenciados */`, `/* Painel de atividade */` etc., linhas 897–2921) → dividir em
  `components/{project-detail,git,database,rails,scripts,navigation,activity,processes,git-diff}.css`,
  com `components.css` reduzido a `@import`, no mesmo espírito da consolidação da task 023.
- Mesma técnica para `database-layout-polish.css`, `scripts-explorer-redesign.css` e
  `project-tests-redesign.css`.

### Fase 4 — Componentes `.vue` grandes (risco médio)

- Extrair `<style scoped>` para um arquivo irmão via `<style scoped src="./NomeDoComponente.css">`
  (suportado nativamente pelo compilador de SFC do Vue — comportamento idêntico ao style inline).
- Extrair grupos coesos do `<script setup>` para composables (`composables/useLogPolling.ts`,
  `useRailsLogFilters.ts`, `useGitDiffView.ts` etc.), um composable por responsabilidade já visível
  no arquivo atual.
- Um componente por vez; rodar `npm run test --workspace=@dev-dashboard/web` e o smoke E2E depois
  de cada extração.

### Fase 5 — Camada "enhancer" (risco médio — decisão registrada)

Decisão: por ora, **só quebrar mecanicamente**, sem migrar o padrão para dentro dos componentes
Vue.

- Dentro de cada `*-enhancer.ts`, separar `renderX()`, estado e wiring de eventos em módulos
  menores no mesmo diretório, mantendo a única função pública `installX()` como fachada — sem mudar
  o padrão vanilla-DOM em si.
- Migrar o padrão inteiro para lógica reativa dentro dos componentes Vue (eliminando o patch
  pós-render) fica registrado como alternativa mais profunda, fora de escopo deste plano — reavaliar
  como decisão arquitetural separada se a camada "enhancer" continuar crescendo.

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
