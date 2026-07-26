# Task 016 — Git: criar e trocar branch (mutação mínima)

## Status

Concluída.

## Objetivo

Primeira mutação Git no dashboard: criar branch a partir do HEAD atual
e trocar de branch, cada operação protegida por confirmação obrigatória
e validação da árvore de trabalho.

## Escopo entregue

- Novos contratos em `packages/contracts/src/git.ts`:
  `GitMutationOperation` (`create-branch` | `switch-branch`) e
  `GitMutationConfirmation` (`token`, `operation`, `target`,
  `expiresAt`).
- `GitService` ganha:
  - `prepareMutationConfirmation(projectId, operation, target)` gerando
    token de 64 hex com TTL de 60s.
  - `createBranch(projectPath, projectId, name, token)` que valida o
    nome via regex fechada, exige repositório existente e árvore
    limpa, verifica se o branch já existe (`GIT_BRANCH_EXISTS`) e roda
    `git switch --create`.
  - `switchBranch(projectPath, projectId, name, token)` que valida o
    nome, confirma existência do branch (`GIT_BRANCH_NOT_FOUND`) e
    árvore limpa, e roda `git switch`.
- `GitMutationError` com códigos dedicados
  (`GIT_NOT_REPOSITORY`, `GIT_BRANCH_INVALID`, `GIT_BRANCH_EXISTS`,
  `GIT_BRANCH_NOT_FOUND`, `GIT_WORKING_TREE_DIRTY`,
  `GIT_MUTATION_CONFIRMATION_REQUIRED`) integrados ao union
  `ApiErrorCode`.
- Rotas novas:
  - `POST /api/projects/:projectId/git/mutations/confirmations`
    (`{ operation, target }`).
  - `POST /api/projects/:projectId/git/branches` (`{ name,
    confirmationToken }`).
  - `POST /api/projects/:projectId/git/switch` (`{ name,
    confirmationToken }`).
- Cliente `prepareProjectGitMutation`, `createProjectGitBranch`,
  `switchProjectGitBranch` em `apps/web/src/api.ts`.
- Painel Git ganha seção "Criar e trocar branch" com dois formulários,
  `window.confirm` obrigatório antes de despachar, mensagem de sucesso
  e erro; após sucesso recarrega overview e diff.
- Estilos `git-mutation-*` em `styles.css`.

## Testes

- `apps/api/test/git-service-mutations.test.ts` (6 casos, repo
  efêmero): criar branch, sem confirmação, nome inválido, branch já
  existente, switch em árvore suja, switch em branch inexistente.
- `apps/web/test/project-git-panel.test.ts` ganha 2 casos: fluxo
  completo de criar branch (confirmação → mutação com token
  encaminhado) e cancelamento pelo `window.confirm` que não dispara
  nenhuma requisição de mutação.

## Fora do escopo

- `pull`, `push`, `commit`, `stash`, `delete branch` — próximas etapas
  do Horizonte 2.
- Rebase/merge/cherry-pick.
- Confirmação com nível de risco progressivo (fica no roadmap para
  operações mais destrutivas).

## Verificação

```
npm run typecheck
npm run build
npm test
```

`apps/api` passa de 96 para 104 casos; `apps/web` de 30 para 32.
