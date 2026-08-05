# Task 109 — Remove o código órfão de stash

## Objetivo

Fechar o achado da task 108: stash foi entregue no painel Git pela task 026,
mas o redesenho das tasks 047–050 nunca migrou essa parte para o novo
`ProjectGitPanel.vue` — ficou código morto (frontend) e uma API sem
consumidor (backend). Decisão: remover, não reconstruir (ver conversa que
originou esta task). Não toca em `lib/git/stash` (CLI bash, funcionalidade
própria e independente do dashboard web).

## O que foi removido

### Frontend

- `apps/web/src/git-stash-enhancer.ts`/`.css` e o diretório
  `apps/web/src/git-stash/` (`actions.ts`, `controls.ts`, `detail.ts`,
  `dom-helpers.ts`, `format.ts`, `list.ts`, `notice.ts`, `state.ts`,
  `types.ts`) — o enhancer vanilla-DOM que injetava a UI de stash antes da
  migração para Vue; não era mais importado por `main.ts`.
- `stashPushProjectGit`/`stashPopProjectGit` e os tipos de resposta
  associados em `apps/web/src/api/git.ts`.
- A entrada `.git-stash-detail` em
  `apps/web/src/git-inline-file-diff/configurations.ts` (config genérica de
  detalhe de diff inline, compartilhada com Resumo/Histórico — mantida para
  os dois que continuam ativos).
- Seletores CSS órfãos (`.git-stash-*`) em `git-diff-github-theme.css`,
  `git-diff-syntax/constants.ts`, `styles/components/git-diff.css`,
  `git-inline-file-diff-enhancer.css` e `.stash-table` em
  `components/ProjectGitPanel.css` (essa última já sem uso no template
  antes desta task).

### Backend

- `apps/api/src/routes/git-stash.ts` e o diretório
  `apps/api/src/routes/git-stash/` — CRUD completo de stash por referência
  (listar, aplicar, remover), nunca consumido pelo frontend.
- `apps/api/src/services/git-stash-service.ts` e o diretório
  `apps/api/src/services/git-stash/`.
- As duas rotas mais simples de stash (`POST /git/stash`,
  `POST /git/stash/pop`, "guardar/restaurar o mais recente" da task 026)
  em `apps/api/src/routes/git-mutations.ts`, e os métodos
  `stashPush`/`stashPop`/`stashOperations` de `GitService`
  (`apps/api/src/services/git-service/stash-operations.ts`, `stash.ts`).
- O campo `stashes` em `getOverview` (`git-service/read-operations.ts`) —
  `ProjectGitOverview` não lista mais stashes.
- Registro das rotas em `apps/api/src/app.ts`.
- Os seis `GIT_STASH_*`/`GIT_NOTHING_TO_STASH` da união de códigos de erro
  em `git-service/errors.ts` e `http/api-error.ts`.

### Contratos compartilhados

- `packages/contracts/src/git-stash.ts` (tipos do CRUD completo).
- `GitStashEntry` e o campo `stashes` de `ProjectGitOverview` em `git.ts`.
- `'stash-push'`/`'stash-pop'` de `GitMutationOperation` (`git.ts`) e as
  seis entradas correspondentes (duas simples + quatro do painel completo)
  em `git-mutation-catalog.ts`.

### Testes e documentação

- Removidos `apps/api/test/git-stash-service.test.ts` e
  `git-stash-mutation-history.test.ts`; removidos os casos específicos de
  stash em `git-service-mutations.test.ts`, `git-mutation-routes.test.ts` e
  `git-mutation-catalog.test.ts`.
- Ajustados fixtures/asserções de stash em sete testes de componente Vue
  (`project-card`, `project-detail-cards`, `project-git-branch-publish`,
  `project-git-diff-page`, `project-git-pull-request-page`,
  `project-git-sync-and-branches`, `project-git-undo-page`,
  `project-git-panel`) e reescrito `git-inline-file-diff-enhancer.test.ts`
  para usar a config `.git-summary-*` (ainda ativa) em vez de
  `.git-stash-*` (removida) como fixture — o teste sempre exerceu o
  comportamento genérico do enhancer, só usava stash como exemplo.
  `git-diff-github-theme.test.ts` não afirma mais a existência do seletor
  `.git-stash-patch`.
- `docs/index.md`, `docs/design/information-architecture.md`,
  `tasks/roadmap.md` e `apps/web/e2e/README.md`: removida a menção a
  stash como capacidade atual/fora de escopo por inalcançabilidade — ela
  simplesmente não existe mais como conceito no dashboard web.
- `docs/architecture/api-reference.md`: regenerado (157 → 148 rotas).
- `docs/architecture/refactoring-arquivos-grandes.md` **não foi tocado** —
  é um registro histórico do que já foi feito em cada fase da refatoração
  de arquivos grandes; continua descrevendo com precisão o que aconteceu
  então, mesmo que os arquivos citados tenham sido removidos depois por
  este outro motivo.

## Validação

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run docs:api:check` (regenerado com `npm run docs:api`, 148 rotas)
- `npm test` (`node --test` da API/packages/scripts + Vitest de
  `apps/web`: 88 arquivos, 353 testes)
- `npx playwright test --config=apps/web/e2e/playwright.config.ts` (suíte
  completa, 21/21)

## Arquivos alterados

Ver as seções acima — a lista completa de arquivos removidos/editados está
no diff do commit desta task.
