# Task 236 — Remove favoritos e exclusão de projeto órfãos

**Status:** concluída em 2026-08-12.

## Objetivo

A task 235 removeu da Visão geral a ação individual de favoritar, a ação
individual de excluir/remover projeto e o rótulo **Abrir**. Esta task limpa o
código que ficou inalcançável depois dessa remoção — ponta a ponta, frontend
e backend — já que nenhum `.vue` do repositório ainda referencia essas duas
capacidades.

## Resultado

### Favoritos de projeto — removido por completo

- Contrato: `favorite: boolean` removido de `Project` (`packages/contracts`).
- API: rota `PUT /projects/:projectId/favorite` removida
  (`apps/api/src/routes/projects/list-routes.ts`); `setFavorite` removido de
  `ProjectStore`; `favorite` removido do schema de resposta
  (`response-schemas/workspaces-projects.ts`); `favoriteProjectIds` removido
  da montagem da resposta de scan (`apps/api/src/routes/workspaces.ts`).
- `packages/core/src/project-favorite-repository.ts` (e seu teste) excluídos;
  `ProjectFavoriteRepository`/`ProjectFavoriteRepositoryError` removidos de
  `packages/core/src/index.ts` e de toda a cadeia de wiring
  (`app-context.ts`, `app.ts`, `routes/projects/helpers.ts`,
  `routes/workspaces.ts`).
- Frontend: `toggleProjectFavorite`, `replaceProjectFavorite` e
  `favoriteUpdatingIds` removidos de `stores/dashboard.ts`;
  `updateProjectFavorite` removido de `api/workspaces.ts`; ordenação por
  favorito removida de `sortedProjects` (store) e de
  `utils/project-priority.ts` (mantida a ordenação por `lastAccessedAt`).
- CSS morto (`.project-favorite-button`) removido de
  `styles/components/dashboard.css` — nenhum `.vue` renderizava mais esse
  botão desde a task 235.
- Código de erro `PROJECT_FAVORITES_LIMIT_REACHED` removido de `ApiErrorCode`.

### Exclusão/dispensa de projeto — removido por completo

O `removeProject()` do frontend (`stores/dashboard.ts`) não tinha mais
nenhum botão que o chamasse; a cadeia inteira downstream ficou órfã junto:

- Frontend: `removeProject`, `dismissingProjectIds` e o parâmetro
  `restoreDismissed` (store e `api/workspaces.ts`, incluindo o querystring
  do `scanWorkspace`) removidos.
- API: rota `DELETE /projects/:projectId` removida; filtragem por
  `dismissedProjectIds`/`activeDismissedProjectIds` e o parâmetro de
  querystring `restoreDismissed` removidos de
  `POST /workspaces/:workspaceId/scan` (`apps/api/src/routes/workspaces.ts`).
- `ProjectStore.removeProject()` removido (única chamadora era a rota
  `DELETE` acima).
- `packages/core/src/project-dismissed-repository.ts` (e seu teste)
  excluídos; `ProjectDismissedRepository`/`ProjectDismissedRepositoryError`
  removidos de `packages/core/src/index.ts` e da mesma cadeia de wiring.

### Testes e documentação

- Testes que exercitavam especificamente favorito/exclusão removidos
  (casos inteiros em `apps/api/test/routes.test.ts`,
  `apps/web/test/dashboard-store.test.ts`,
  `apps/api/test/project-store.test.ts` — as asserções remanescentes desses
  arquivos foram adaptadas para usar `setEnabled` em vez de `setFavorite`
  onde serviam para testar outro comportamento do `ProjectStore`, não o
  favorito em si).
- Campo `favorite: false` removido mecanicamente de todas as fixtures de
  `Project` nos testes (não alterava asserções, só o formato do objeto).
- `docs/architecture/api-reference.md` regenerado via `npm run docs:api`.
- `docs/architecture/overview.md`, `docs/operations-and-troubleshooting.md`,
  `tasks/PENDENCIAS.md` e `README.md` atualizados para não descrever mais
  favoritos ou exclusão de projeto como capacidade disponível.

## Verificação

`npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:api` e
`npm test` — todos executados isoladamente contra só esta mudança (havia uma
limpeza não relacionada de Atividade/Configurações em andamento em paralelo
no mesmo worktree; ela foi isolada via `git stash push --keep-index` durante
a verificação para não contaminar os resultados). `npm test` aponta 2 falhas
pré-existentes, não relacionadas a esta task e reproduzíveis a partir do HEAD
anterior sem nenhuma mudança desta entrega
(`global-accessibility-guard.test.ts` e `project-card.test.ts`, ambas ligadas
à página de Atividade/ao carregamento assíncrono do card de projeto) — não
foram tocadas aqui.

## Deixado de propósito

- `packages/project-discovery` e os pacotes de teste (`process-manager`)
  também tinham `favorite: false` em fixtures — removido mecanicamente, sem
  mudança de comportamento.
- Nenhum código de UI precisou de alteração além do CSS morto: a task 235 já
  tinha removido todo `.vue` que referenciava favorito/exclusão.
