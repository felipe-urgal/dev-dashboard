# Próxima atividade

A task 096 entregou a primeira etapa da política unificada de risco e
histórico das mutações Git: catálogo fechado das 24 operações reconhecidas,
mecanismo de confirmação compartilhado e histórico persistente e limitado.
`GitService` (11 das 13 operações de `GitMutationOperation`, mais
`discard-file`/`remove-untracked-file`) já migrou, sem alterar o
comportamento externo de nenhuma rota existente. Ver
`docs/tasks/096-git-mutation-risk-policy.md` para o inventário completo do
que foi entregue e do que ficou de fora.

## Task 098 — Migração completa da política de risco e histórico Git

### Objetivo

Terminar a migração faseada iniciada na task 096: levar os serviços de
mutação Git restantes para o mesmo mecanismo de confirmação compartilhado
(`GitMutationConfirmationService`) e para o mesmo histórico persistente
(`GitMutationHistoryService`), sem alterar o comportamento externo de
nenhuma rota já existente — mesmo padrão de migração já usado na task 096
para `GitService`.

### Escopo

Serviços que já têm entrada no catálogo (`packages/contracts/src/git-mutation-catalog.ts`)
mas ainda mantêm seu próprio mecanismo de confirmação ad hoc e não gravam no
histórico:

- `DashboardGitService` — sobrescreve a confirmação de
  `create-branch`/`commit`/`amend` com uma política própria do dashboard;
  decidir se adota `GitMutationConfirmationService` diretamente ou se a
  composição atual (herdar de `GitService` e sobrescrever) já é suficiente
  antes de migrar;
- `GitSyncService` (`sync-integrate`, `sync-main`);
- `GitStashService` (`panel-stash-create`, `panel-stash-apply`,
  `panel-stash-pop`, `panel-stash-drop`);
- `GitBranchRenameService` (`branch-rename`);
- `GitBranchDeleteService` (`branch-delete`);
- `GitBranchPublishService` (`branch-publish`);
- `GitUndoService` (`undo-commit`, `undo-file`).

Para cada serviço:

- substituir o `Map` de confirmação privado por
  `GitMutationConfirmationService`, preservando TTL e o código de erro de
  confirmação já usado por quem consome a rota (mesmo padrão da migração de
  `GitService` na task 096 — comportamento externo idêntico, implementação
  interna compartilhada);
- envolver a chamada de mutação nas rotas correspondentes com
  `withGitMutationHistory` (`apps/api/src/routes/git-mutation-history-helpers.ts`),
  registrando sucesso/falha com o `errorCode` já traduzido;
- **não** registrar quando o erro for de confirmação ausente/expirada
  (mesma regra já aplicada a `GitService`).

### Critérios de aceite

- todas as 24 operações do catálogo passam a gerar evento de histórico
  quando executadas (hoje só 11 geram);
- suítes de teste existentes de cada serviço/rota (`git-sync`, `git-stash`,
  `git-branch-rename`, `git-branch-delete`, `git-undo`, rotas de branch
  publish) continuam passando sem modificação — comportamento externo
  preservado;
- novos testes de histórico por serviço migrado, no mesmo padrão de
  `apps/api/test/git-mutation-history-routes.test.ts`;
- `typecheck`, `build`, `docs:api:check`, `test` e smoke E2E continuam
  aprovados.

### Depois desta etapa

Reavaliar se a rota de leitura do catálogo (hoje só consumido em build-time
via import direto de `@dev-dashboard/contracts` no bundle do frontend)
precisa de um endpoint HTTP dedicado, ou se isso nunca chega a ser
necessário.

### Fora do escopo

Os mesmos itens já fora de escopo na task 096: undo automático universal,
auditoria remota/multiusuário, execução de comando Git livre vindo do
navegador, armazenamento de patches/diffs no histórico, substituir o
histórico de commits, alterar a estratégia de pull/push/sync da própria
`main` deste repositório, integração com provedores externos.
