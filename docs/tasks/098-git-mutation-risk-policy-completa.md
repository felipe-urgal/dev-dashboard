# Task 098 — Migração completa da política de risco e histórico Git

## Status

Concluída. Termina a migração faseada iniciada na task 096: os sete serviços
de mutação Git que ainda mantinham confirmação ad hoc e não gravavam no
histórico (`DashboardGitService`, `GitSyncService`, `GitStashService`,
`GitBranchRenameService`, `GitBranchDeleteService`, `GitBranchPublishService`,
`GitUndoService`) agora usam o mesmo `GitMutationConfirmationService` e o
mesmo `GitMutationHistoryService` que `GitService` já usava desde a task 096.
As 24 operações do catálogo (`packages/contracts/src/git-mutation-catalog.ts`)
passam a gerar evento de histórico quando executadas.

## Contexto

Ver `docs/tasks/096-git-mutation-risk-policy.md` para o catálogo completo, o
mecanismo de confirmação compartilhado e o histórico persistente — esta task
não altera nenhum dos três, apenas conecta os serviços restantes a eles.

## Escopo entregue

### `DashboardGitService`

Decisão: **adotar `GitMutationConfirmationService` diretamente**, em vez de
manter a composição anterior (herdar de `GitService` e sobrescrever com um
`Map` próprio). O ponto delicado era preservar exatamente a política que já
existia: `create-branch` valida que o alvo confirmado bate com o nome pedido
na execução, mas `commit`/`amend` **nunca validaram o alvo** (a branch pode
mudar entre a confirmação e a execução — é isso que
`dashboard-git-service.test.ts` cobre em "confirma commit sem depender de uma
segunda leitura da branch atual"). O mecanismo compartilhado sempre exige que
o alvo usado em `prepare` bata com o de `consume`, então `commit`/`amend`
passaram a usar um alvo fixo sintético (`UNSCOPED_TARGET = '*'`) nas duas
pontas — o alvo real informado pelo cliente continua sendo validado
(`validateBranchName`) mas nunca comparado, reproduzindo bit a bit o
comportamento anterior. `create-branch` continua usando o nome de branch como
alvo real, preservando a rejeição testada em `git-mutation-history-routes.test.ts`
("criar branch com sucesso é registrada...") e no teste equivalente do
`GitService`.

Como `DashboardGitService` é a instância `gitService` de `AppContext` (usada
por `apps/api/src/routes/git-mutations.ts`, já envolvida com
`withGitMutationHistory` desde a task 096), `create-branch`/`commit`/`amend`
**já geravam evento de histórico antes desta task** — essa parte do trabalho
era só migrar o mecanismo interno de confirmação, sem tocar em nenhuma rota
nem em `app.ts`/`app-context.ts` para este serviço.

### `GitSyncService` (`sync-integrate`, `sync-main`)

`Map` privado substituído por `GitMutationConfirmationService`. O alvo passou
a ser a composição `${reference}::${strategy}` (o serviço antigo comparava os
dois campos separadamente; a composição preserva a mesma granularidade).
`prepareConfirmation`/`integrate` usam o identificador de catálogo
`sync-integrate`; `prepareMainConfirmation`/`synchronizeMain` usam
`sync-main` — são tratados como operações distintas mesmo quando
`reference`/`strategy` coincidem com os valores fixos da main
(`upstream/main`/`merge`), o que já era o comportamento efetivo antes (as duas
rotas nunca compartilhavam token na prática). O código de erro externo
(`GIT_SYNC_CONFIRMATION_REQUIRED`) é preservado por um `catch` que traduz
`GitMutationConfirmationError` de volta para `GitSyncError`.

A rota (`routes/git-sync.ts`) instanciava `GitSyncService` localmente, sem
vir de `AppContext` — mantido assim (nenhum outro arquivo de rota depende
dessa instância), mas passou a receber `gitMutationHistoryService` via
`options`, injetado a partir de `context.gitMutationHistoryService` em
`app.ts` — a mesma instância compartilhada do `AppContext`, nunca uma segunda
instância isolada do histórico.

### `GitStashService` (`panel-stash-create/apply/pop/drop`)

Mesmo padrão: `Map` privado substituído pelo mecanismo compartilhado. O
vocabulário de operação do serviço (`GitStashOperation`: `create`/`apply`/
`pop`/`drop`) é mapeado para o id do catálogo com o prefixo `panel-stash-`
(`stashCatalogOperationId`), para não colidir com `stash-push`/`stash-pop` de
`GitService`. `GitStashRouteOptions` (compartilhado pelas rotas de
listagem/detalhe e de mutação) ganhou `gitMutationHistoryService`; as quatro
rotas de mutação (`POST /stashes`, `.../apply`, `.../pop`, `.../drop`) foram
envolvidas com `withGitMutationHistory`.

### `GitBranchRenameService` (`branch-rename`)

`Map` privado substituído. O alvo passou a ser a composição
`${currentName}::${nextName}`, preservando o teste existente "recusa
reutilizar a confirmação com outro nome de destino".

### `GitBranchDeleteService` (`branch-delete`)

Migração direta — o alvo já era só o nome da branch, sem composição
necessária.

### `GitBranchPublishService` (`branch-publish`)

Migração direta. O campo `operation` devolvido ao cliente continua sendo
`'push'` (contrato de `GitMutationConfirmation`, inalterado) — o id de
catálogo `branch-publish` é usado apenas internamente para a confirmação e o
histórico. `GitWorkspaceRouteOptions` (compartilhado por
`workspace-routes.ts`, `branch-tracking-routes.ts` e
`branch-publish-routes.ts`) ganhou `gitMutationHistoryService`; só as rotas de
publicação foram envolvidas com `withGitMutationHistory` — `track-branch` e
`delete-remote-branch` (do `GitBranchService`, usado por
`branch-tracking-routes.ts`) continuam fora do escopo desta task, como já
estavam fora do escopo da 096 (não fazem parte da lista de sete serviços a
migrar; permanecem catalogadas para rótulo/risco, sem gravar histórico).

### `GitUndoService` (`undo-commit`, `undo-file`)

Migração direta — `GitUndoOperation` (`commit`/`file`) mapeado para
`undo-commit`/`undo-file`.

### Ajuste no helper compartilhado

`routes/git-mutation-history-helpers.ts`: `isConfirmationRequiredError`
passou a reconhecer três códigos de "confirmação obrigatória" em vez de um
só. A maioria dos serviços usa `GIT_MUTATION_CONFIRMATION_REQUIRED` (mesmo
código de `GitMutationConfirmationError`), mas `GitSyncService` e
`GitStashService` preservam seus próprios códigos externos já testados
(`GIT_SYNC_CONFIRMATION_REQUIRED`/`GIT_STASH_CONFIRMATION_REQUIRED`) — sem
esse ajuste, uma tentativa sem confirmação nesses dois serviços teria sido
registrada como falha no histórico em vez de ser ignorada.

### `app.ts`/`app-context.ts`

Nenhuma mudança em `app-context.ts` — o único novo requisito de wiring era
propagar a instância já existente `context.gitMutationHistoryService` para
seis registros de rota que ainda não a recebiam (`gitSyncRoutes`,
`gitStashRoutes`, `gitBranchRenameRoutes`, `gitBranchDeleteRoutes`,
`gitWorkspaceRoutes`, `gitUndoRoutes`), em `app.ts`.

## Nuance encontrada: código de erro bruto vs. traduzido no histórico

`withGitMutationHistory` registra `errorCode` a partir do erro **bruto**
lançado pelo serviço (antes de qualquer tradução feita pela camada de rota
via `translate*Error`). Para `GitService`/`DashboardGitService`/
`GitBranchRenameService`/`GitBranchDeleteService`/`GitBranchPublishService`/
`GitUndoService`, o código interno e o código HTTP externo já coincidem
(`GIT_BRANCH_NOT_FOUND`, `GIT_FILE_NOT_FOUND` etc.), então essa distinção
nunca aparecia nos testes da task 096. Para `GitStashService`, os dois
vocabulários **divergem** em alguns casos (`GIT_STASH_NOT_FOUND` interno vira
`GIT_REFERENCE_NOT_FOUND` na resposta HTTP; `GIT_STASH_DROP_FAILED` vira
`GIT_COMMAND_FAILED`) — o evento de histórico grava o código interno bruto
(`GIT_STASH_NOT_FOUND`), não o traduzido. Documentado e coberto pelo teste
`git-stash-mutation-history.test.ts` ("falha controlada..."); nenhuma mudança
de comportamento foi feita no helper compartilhado além do reconhecimento dos
códigos de confirmação obrigatória, para não alterar o histórico já gravado
pelos serviços migrados na task 096.

## Testes automatizados

Um arquivo de teste de rota novo por serviço migrado, no mesmo padrão de
`apps/api/test/git-mutation-history-routes.test.ts` (repositório Git efêmero
real, `buildApp` + `createAppContext`): histórico começa vazio, sucesso
aparece com o risco certo do catálogo, falha aparece com `errorCode`,
confirmação ausente/expirada não gera evento, nenhum evento contém o caminho
absoluto do projeto (nem, no caso do stash, o conteúdo do patch/mensagem).

- `apps/api/test/git-sync-mutation-history.test.ts` (novo): `sync-integrate`
  (sucesso, confirmação ausente, `GIT_REFERENCE_NOT_FOUND`) e `sync-main`
  (sucesso).
- `apps/api/test/git-stash-mutation-history.test.ts` (novo):
  `panel-stash-create`/`panel-stash-pop` (sucesso), confirmação ausente,
  `panel-stash-drop` com stash inexistente (`GIT_STASH_NOT_FOUND` bruto no
  histórico vs. `GIT_REFERENCE_NOT_FOUND` na resposta HTTP).
- `apps/api/test/git-branch-rename-mutation-history.test.ts` (novo).
- `apps/api/test/git-branch-delete-mutation-history.test.ts` (novo).
- `apps/api/test/git-branch-publish-mutation-history.test.ts` (novo).
- `apps/api/test/git-undo-mutation-history.test.ts` (novo): `undo-commit`
  (sucesso) e `undo-file` (confirmação ausente, `GIT_FILE_NOT_FOUND`).

Nenhuma asserção de teste existente foi alterada — as suítes de serviço
(`git-sync-service.test.ts`, `git-stash-service.test.ts`,
`git-branch-rename-service.test.ts`, `git-branch-delete-service.test.ts`,
`git-branch-publish-service.test.ts`, `git-undo-service.test.ts`,
`dashboard-git-service.test.ts`, `git-service-mutations.test.ts`,
`git-mutation-routes.test.ts`, `git-mutation-history-routes.test.ts`,
`git-mutation-confirmation-service.test.ts`,
`git-mutation-history-service.test.ts`, `git-mutation-catalog.test.ts`) e as
suítes de todo o monorepo continuam passando sem modificação — apenas
instanciação (nenhuma delas instanciava serviço com dependência nova por
construtor; a única mudança de assinatura pública foi
`GitBranchRenameConfirmation`/`GitBranchDeleteConfirmation` etc. continuarem
retornando `expiresAt` como string ISO, agora vinda de
`GitMutationConfirmationService.prepare`, idêntico ao valor anterior).

`npm run typecheck`, `npm run build`, `npm run docs:api:check` (sem
diferença — nenhuma rota nova, `docs/architecture/api-reference.md`
permaneceu com as mesmas 152 rotas), `npm test` (507 testes em `apps/api`
via `node --test`, mais 332 testes em `apps/web` via Vitest — 82 arquivos —,
mais as suítes de `packages/*`, todos aprovados) e `npm run test:e2e` (18/18)
aprovados a partir da raiz do worktree. `apps/api/test/script-execution-service.test.ts`
foi rodado isolado como verificação extra (pedida pela task) e passou
normalmente — não chegou a aparecer instável na bateria completa desta
rodada.

## Fora do escopo (mantido conforme o plano original)

Os mesmos itens já fora de escopo na task 096 — undo automático universal,
auditoria remota/multiusuário, execução de comando Git livre vindo do
navegador, armazenamento de patches/diffs no histórico, substituir o
histórico de commits, alterar a estratégia de pull/push/sync da própria
`main` deste repositório, integração com provedores externos — mais:

- `track-branch`/`delete-remote-branch` (`GitBranchService`, usado por
  `routes/git-workspace/branch-tracking-routes.ts`): já catalogados
  (rótulo/risco visíveis), mas não faziam parte da lista de sete serviços
  desta task e continuam sem confirmação compartilhada nem histórico — ficam
  como uma etapa futura, se algum dia se decidir por unificá-los também;
- a rota HTTP dedicada de leitura do catálogo, avaliada e novamente
  descartada — o frontend continua importando `@dev-dashboard/contracts`
  diretamente em build-time, sem necessidade de um endpoint.

## Arquivos alterados

- `apps/api/src/services/dashboard-git-service.ts`
- `apps/api/src/services/git-sync-service.ts`
- `apps/api/src/services/git-stash-service.ts`
- `apps/api/src/services/git-branch-rename-service.ts`
- `apps/api/src/services/git-branch-delete-service.ts`
- `apps/api/src/services/git-branch-publish-service.ts`
- `apps/api/src/services/git-undo-service.ts`
- `apps/api/src/routes/git-sync.ts`
- `apps/api/src/routes/git-stash/helpers.ts`
- `apps/api/src/routes/git-stash/mutation-routes.ts`
- `apps/api/src/routes/git-branch-rename.ts`
- `apps/api/src/routes/git-branch-delete.ts`
- `apps/api/src/routes/git-workspace/helpers.ts`
- `apps/api/src/routes/git-workspace/branch-publish-routes.ts`
- `apps/api/src/routes/git-undo.ts`
- `apps/api/src/routes/git-mutation-history-helpers.ts`
- `apps/api/src/app.ts`
- `apps/api/test/git-sync-mutation-history.test.ts` (novo)
- `apps/api/test/git-stash-mutation-history.test.ts` (novo)
- `apps/api/test/git-branch-rename-mutation-history.test.ts` (novo)
- `apps/api/test/git-branch-delete-mutation-history.test.ts` (novo)
- `apps/api/test/git-branch-publish-mutation-history.test.ts` (novo)
- `apps/api/test/git-undo-mutation-history.test.ts` (novo)
- `docs/tasks/098-git-mutation-risk-policy-completa.md` (novo, este arquivo)
