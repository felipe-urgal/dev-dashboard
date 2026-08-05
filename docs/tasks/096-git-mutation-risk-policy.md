# Task 096 — Política unificada de risco e histórico Git

## Status

Concluída (primeira etapa). `docs/tasks/NEXT.md` chamava esta entrega de
"task 091" — esse número já havia sido usado por outra entrega; o número
real, na sequência de `docs/tasks/`, é 096.

## Contexto

A auditoria da task 086 apontou inconsistência entre confirmações e
resultados das mutações Git: cada serviço (`GitService`, `GitSyncService`,
`GitStashService`, `GitBranchRenameService`, `GitBranchDeleteService`,
`GitBranchPublishService`, `GitUndoService`) mantinha seu próprio `Map` de
confirmação, seu próprio vocabulário de risco (nenhum, na prática — risco
não era classificado em lugar nenhum) e nenhum dos dois lados persistia o
resultado de uma tentativa de mutação.

## Objetivo

Criar um contrato comum para classificar, confirmar e registrar as mutações
Git já existentes, tornando previsíveis as operações de branch,
sincronização, commit, stash, arquivos e desfazer sem alterar seus comandos
ou permitir shell livre.

## Decisão principal

A API continua sendo a autoridade das mutações. Um catálogo fechado, em
`packages/contracts` (compartilhado por API e frontend, sem lógica de
infraestrutura), descreve cada operação reconhecida por identificador,
rótulo, descrição, nível de risco (`read-only` | `write-safe` |
`write-remote` | `destructive`) e exigência de confirmação. Um mecanismo de
confirmação compartilhado generaliza o padrão token + TTL + vínculo a
projeto/operação/alvo. Um histórico persistente e limitado grava apenas
metadados operacionais — nunca comando, mensagem, caminho, patch,
stdout/stderr ou token.

Dado o tamanho do inventário (13 operações já cobertas por
`GitMutationOperation`, mais operações de sincronização, stash avançado,
renomear/excluir/publicar branch e desfazer — 24 no total), a migração para
o mecanismo compartilhado de confirmação e para o registro de histórico foi
feita **por etapas**, como o próprio `NEXT.md` antecipava. Esta entrega
migra o catálogo (completo, cobrindo as 24 operações) e o serviço mais
usado, `GitService` — que concentra 11 das 13 operações de
`GitMutationOperation` — mais `discard-file`/`remove-untracked-file`
(também em `GitService`, expostas por rotas separadas). As demais operações
ficam catalogadas para fins de rótulo/risco, mas continuam com sua
confirmação ad hoc existente — ver "Próxima etapa".

## Escopo entregue

### Catálogo compartilhado (`packages/contracts`)

- `git-mutation-catalog.ts` (novo): `GitMutationRiskLevel`,
  `GitMutationCatalogEntry` (`id`, `label`, `description`, `risk`,
  `requiresConfirmation`), constante `GIT_MUTATION_CATALOG` com as 24
  operações inventariadas (as 13 de `GitMutationOperation` mais
  `sync-integrate`, `sync-main`, `panel-stash-create/apply/pop/drop`,
  `branch-rename`, `branch-delete`, `branch-publish`, `undo-commit`,
  `undo-file`), `GIT_MUTATION_CATALOG_BY_ID` e
  `findGitMutationCatalogEntry`. Puramente dados — sem dependência de
  Fastify ou Vue, como o resto do pacote.
- `git-mutation-history.ts` (novo): `GitMutationHistoryEvent`,
  `GitMutationHistoryResult`, `GitMutationHistoryPage`.
- Reexportados por `packages/contracts/src/index.ts`.

### Mecanismo de confirmação compartilhado (`apps/api`)

- `services/git-mutation-confirmation-service.ts` (novo):
  `GitMutationConfirmationService` — token de 32 bytes (64 hex), TTL
  configurável (60s por padrão), vinculado a projeto + identificador de
  operação + alvo normalizado, uso único, com `GitMutationConfirmationError`
  dedicado.
- `services/git-service.ts` migrado: o `Map` privado de confirmações foi
  substituído por uma instância de `GitMutationConfirmationService`, mesma
  TTL (`GIT_MUTATION_CONFIRMATION_TTL_MS`), mesmo comportamento externo —
  `prepareMutationConfirmation`/erro `GIT_MUTATION_CONFIRMATION_REQUIRED`
  preservados byte a byte para quem consome o serviço. `DashboardGitService`
  (que sobrescreve a confirmação de `create-branch`/`commit`/`amend` com uma
  política própria do dashboard) não foi tocado nesta etapa — continua com
  seu próprio `Map`, documentado abaixo como próxima etapa.

### Histórico persistente e limitado (`apps/api`)

- `services/git-mutation-history-service.ts` (novo): grava eventos em um
  único arquivo JSON versionado (`git-mutation-history/events.json` no
  diretório de estado, mesmo padrão de `TestExecutionHistoryService` —
  diretório `0700`, arquivo `0600`, escrita atômica por arquivo temporário +
  `rename`), com fila de escrita serializada para evitar leitura/gravação
  concorrente. Cada evento: `id`, `projectId`, `workspaceId?`,
  `operationId` (id do catálogo), `risk` (resolvido do catálogo no momento
  do registro), `occurredAt` (instante do servidor), `result`
  (`succeeded`/`failed`), `errorCode?`. Nenhum outro campo.
- Limites da política inicial aplicados em `enforceLimits`: no máximo 200
  eventos por projeto e 2000 no total, sempre preservando os mais recentes
  (a lista já é mantida do mais novo para o mais antigo).
- `record()` nunca lança: uma falha ao persistir é capturada internamente e
  registrada via `console.error`, sem transformar o resultado da mutação em
  falha percebida pelo chamador.
- `history(projectId, page, pageSize)` pagina e retorna `totalPages`
  calculado sobre os eventos daquele projeto.

### Wiring nas rotas existentes (sem mudar comportamento externo)

- `routes/git-mutation-history-helpers.ts` (novo):
  `withGitMutationHistory(historyService, project, operationId, run)` —
  executa a mutação, registra sucesso ou falha (com o `code` já traduzido
  pela camada de serviço) no histórico, e **não** registra quando o erro é
  `GIT_MUTATION_CONFIRMATION_REQUIRED` (falha de protocolo do cliente antes
  de qualquer tentativa real, não um resultado de mutação — mesma leitura de
  "operações somente leitura não entram no histórico" aplicada ao passo
  anterior à execução). O erro original sempre é relançado sem alteração.
- `routes/git-mutations.ts`: as 9 rotas de mutação (`create-branch`,
  `switch-branch`, `pull`, `push`, `commit`, `amend`, `save`, `stash-push`,
  `stash-pop`) passaram a envolver a chamada ao `gitService` com
  `withGitMutationHistory`, sem alterar status HTTP, corpo de resposta nem
  código de erro de nenhum cenário existente.
- `routes/git-file-mutations.ts`: `discard-file` e `remove-untracked-file`
  migradas da mesma forma; `stage`/`unstage` (não fazem parte do catálogo —
  são reversíveis triviais, sem confirmação) ficaram de fora, como já eram.
- `app-context.ts`/`app.ts`: novo `gitMutationHistoryService` no
  `AppContext`, injetado em `gitMutationRoutes`, `gitFileMutationRoutes` e na
  nova rota abaixo.

### Rota paginada e autenticada

- `GET /api/projects/:projectId/git/mutation-history?page&pageSize` (novo,
  `routes/git-mutation-history.ts`) — mesma autenticação/CORS das demais
  rotas privadas, `projectId` resolvido via `ProjectStore` (404
  `PROJECT_NOT_FOUND` se desconhecido), `pageSize` limitado a 100 pelo
  schema. Schema de resposta em
  `apps/api/src/http/response-schemas/git.ts`
  (`gitMutationHistoryPageResponseSchema`/`gitMutationHistoryEventResponseSchema`)
  fecha exatamente os campos do contrato — nenhum campo interno vaza.

### Frontend (`apps/web`)

- `api/git.ts`: `fetchProjectGitMutationHistory(projectId, page, pageSize)`.
- `composables/useProjectGitMutationHistoryPanel.ts` (novo): mesmo padrão
  `generation`/invalidação por projeto de `useProjectRailsCredentials.ts`.
- `components/ProjectGitMutationHistoryPage.vue` (novo): visão compacta —
  lista paginada com rótulo do catálogo (`findGitMutationCatalogEntry`),
  selo de risco, selo de sucesso/falha, código de erro quando houver, e
  paginação simples. Usa `Card`/`StatusBadge` existentes.
- Nova aba "Mutações" em `ProjectGitPanel` (`useProjectGitPanel.ts`,
  `ProjectGitPanel.template.html`/`.vue`), ao lado de "Histórico" (commits)
  — não a substitui; o rótulo e o texto de apoio do painel deixam explícito
  que é o histórico de tentativas de mutação, não de commits.

## Testes automatizados

- `apps/api/test/git-mutation-catalog.test.ts` (novo): sem ids duplicados,
  toda entrada com rótulo/descrição/risco válido, as 13 operações de
  `GitMutationOperation` presentes, classificação de risco de
  `discard-file`/`remove-untracked-file` (`destructive`) e
  `push`/`branch-publish` (`write-remote`).
- `apps/api/test/git-mutation-confirmation-service.test.ts` (novo): token de
  64 hex, uso único, recusa entre projetos/operações/alvos diferentes,
  recusa de token ausente/desconhecido/expirado (TTL customizado no teste).
- `apps/api/test/git-mutation-history-service.test.ts` (novo): registro com
  risco resolvido do catálogo, registro de falha com `errorCode`,
  persistência entre instâncias (reabertura do arquivo), filtro por
  projeto, paginação (`page`/`pageSize`/página além do total), limite de
  200 por projeto, limite global de 2000 cortando entre 11 projetos, e um
  teste de mascaramento que verifica a lista fechada de campos serializados
  e a ausência de caminho absoluto ou termos como `password`/`secret`/
  `token`/`bearer` no evento.
- `apps/api/test/git-mutation-history-routes.test.ts` (novo, com repositório
  Git efêmero real): histórico começa vazio; `create-branch` bem-sucedida
  aparece com risco `write-safe` e sem o caminho absoluto do projeto no
  corpo da resposta; confirmação ausente/expirada não gera evento;
  `switch-branch` para branch inexistente é registrada como `failed` com
  `errorCode: GIT_BRANCH_NOT_FOUND`; paginação por `page`/`pageSize`;
  autenticação obrigatória (401 sem token); projeto desconhecido (404).
- `apps/api/test/git-service-mutations.test.ts` e
  `apps/api/test/git-mutation-routes.test.ts` (existentes, não alterados):
  todos os 35 + 14 casos continuam passando sem modificação, confirmando que
  a migração da confirmação e o wiring do histórico não mudaram nenhum
  código de erro nem resultado das rotas Git já existentes.
- `apps/web/test/project-git-mutation-history-page.test.ts` (novo): estado
  vazio, rótulo do catálogo + selo de risco + selo de resultado + código de
  erro de um evento, mensagem de erro em falha de rede, paginação (clique em
  "Próxima" chama a API com `page: 2`), e verificação de que o HTML nunca
  contém o caminho absoluto do projeto.
- `apps/web/test/project-detail-cards.test.ts` e
  `apps/web/test/project-git-panel.test.ts` (existentes): listas de abas
  atualizadas para incluir "Mutações" como última aba.
- `npm run typecheck`, `npm run build`, `npm run docs:api:check` (após rodar
  `npm run docs:api`, que regenerou `docs/architecture/api-reference.md`
  com a nova rota) e `npm test` na raiz, todos aprovados.

## Próxima etapa (fora desta entrega)

A migração dos serviços restantes para o mecanismo compartilhado de
confirmação e para o registro de histórico ficou para uma próxima task,
como o próprio plano já previa ("migrar por etapas"):

- `DashboardGitService` (`create-branch`/`commit`/`amend` com política
  própria do dashboard) — continua com seu `Map` de confirmação isolado;
  precisa decidir se adota `GitMutationConfirmationService` diretamente ou
  se a composição atual (herdar de `GitService` e sobrescrever) já é
  suficiente.
- `GitSyncService` (`sync-integrate`/`sync-main`), `GitStashService`
  (`panel-stash-*`), `GitBranchRenameService` (`branch-rename`),
  `GitBranchDeleteService` (`branch-delete`), `GitBranchPublishService`
  (`branch-publish`) e `GitUndoService` (`undo-commit`/`undo-file`) — todos
  já têm entrada no catálogo (rótulo, descrição, risco), mas continuam com
  seu `Map` de confirmação próprio e não gravam no histórico ainda.
- Depois dessa migração, considerar mover a rota de leitura do catálogo (`GET`
  somente se o frontend precisar dele fora de build-time — hoje ele é
  importado diretamente de `@dev-dashboard/contracts` no bundle, sem
  necessidade de uma rota HTTP dedicada).

## Fora de escopo (mantido conforme o plano original)

- undo automático universal;
- auditoria remota ou multiusuário;
- execução de comandos Git fornecidos pelo navegador;
- armazenamento de patches ou diffs no histórico;
- substituir o histórico de commits;
- alterar a estratégia atual de pull, push ou sincronização da `main` deste
  repositório;
- integração com provedores externos.

## Limitações conhecidas

- O histórico de mutações cobre, nesta etapa, 11 das 24 operações
  catalogadas (as que já passam por `GitService`/`GitFileMutationRoutes`).
  As demais aparecem no catálogo (rótulo/risco visíveis caso algum painel
  queira exibi-los) mas ainda não geram evento de histórico.
- O arquivo único de histórico (`events.json`) é suficiente para o limite
  de 2000 eventos definido na política inicial; se esse teto crescer
  substancialmente em uma iteração futura, vale reavaliar para um arquivo
  por projeto (como `TestExecutionHistoryService`) para reduzir o custo de
  cada gravação.
- Sem retenção por tempo (apenas por contagem) — consistente com a política
  inicial descrita em `NEXT.md`, mas diferente da retenção por dias usada em
  logs de processo.

## Arquivos alterados

- `packages/contracts/src/git-mutation-catalog.ts` (novo)
- `packages/contracts/src/git-mutation-history.ts` (novo)
- `packages/contracts/src/index.ts`
- `apps/api/src/services/git-mutation-confirmation-service.ts` (novo)
- `apps/api/src/services/git-mutation-history-service.ts` (novo)
- `apps/api/src/services/git-service.ts`
- `apps/api/src/routes/git-mutation-history.ts` (novo)
- `apps/api/src/routes/git-mutation-history-helpers.ts` (novo)
- `apps/api/src/routes/git-mutations.ts`
- `apps/api/src/routes/git-file-mutations.ts`
- `apps/api/src/http/response-schemas/git.ts`
- `apps/api/src/app-context.ts`
- `apps/api/src/app.ts`
- `apps/api/test/git-mutation-catalog.test.ts` (novo)
- `apps/api/test/git-mutation-confirmation-service.test.ts` (novo)
- `apps/api/test/git-mutation-history-service.test.ts` (novo)
- `apps/api/test/git-mutation-history-routes.test.ts` (novo)
- `apps/web/src/api/git.ts`
- `apps/web/src/composables/useProjectGitMutationHistoryPanel.ts` (novo)
- `apps/web/src/composables/useProjectGitPanel.ts`
- `apps/web/src/components/ProjectGitMutationHistoryPage.vue` (novo)
- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/components/ProjectGitPanel.template.html`
- `apps/web/test/project-git-mutation-history-page.test.ts` (novo)
- `apps/web/test/project-detail-cards.test.ts`
- `apps/web/test/project-git-panel.test.ts`
- `docs/architecture/api-reference.md` (gerado por `npm run docs:api`)
- `docs/tasks/096-git-mutation-risk-policy.md` (novo, este arquivo)
