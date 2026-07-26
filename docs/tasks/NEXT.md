# Próxima atividade — 016: Git — criar e trocar branch (mutação mínima)

## Contexto

Com o diff Git somente leitura entregue (task 015), a próxima etapa do
Horizonte 2 é iniciar as operações mutáveis Git, começando pelo par
mais previsível: criar branch a partir de HEAD e trocar de branch. Cada
mutação exige política de risco proporcional e histórico próprio, como
descrito no roadmap.

## Objetivo

Expor operações mutáveis Git de baixo risco (criar branch, trocar
branch) na API e na aba Git da view do projeto, com confirmação
proporcional, sem admitir strings arbitrárias no shell e sem afetar
processos externos.

## Plano detalhado

1. Novos códigos `ApiErrorCode` para as falhas específicas
   (`GIT_BRANCH_EXISTS`, `GIT_BRANCH_INVALID`, `GIT_WORKING_TREE_DIRTY`,
   `GIT_BRANCH_NOT_FOUND`).
2. `GitService.createBranch(project, name)` — valida nome via regex
   fechada (`^(?!/)(?!.*//)[A-Za-z0-9._/-]+(?<!/)$`) e chama
   `git switch --create <name>` a partir do HEAD atual; falha limpa
   quando a árvore está suja.
3. `GitService.switchBranch(project, name)` — valida nome e chama
   `git switch <name>`; falha com `GIT_WORKING_TREE_DIRTY` se houver
   alterações não commitadas.
4. Rotas novas:
   - `POST /api/projects/:projectId/git/branches` (body `{ name }`).
   - `POST /api/projects/:projectId/git/switch` (body `{ name }`).
   Ambas exigem confirmação prévia via `POST
   /api/projects/:projectId/git/mutations/confirmations` (mesmo padrão
   já usado em scripts).
5. Cliente + painel Git ganham botões "Criar branch" e "Trocar
   branch", cada um com prompt de confirmação e feedback visual.
6. Testes:
   - `git-service` com repositório efêmero (criar/trocar, nome
     inválido, árvore suja).
   - rotas (autorização, path validado, confirmação obrigatória).
   - painel Vue (estado antes/depois do sucesso, erro).
7. Atualizar `README`, roadmap (marcar "criação/troca de branch,
   pull e push" parcialmente) e registrar a task 016.

## Fora do escopo

- `pull`, `push`, `commit`, `stash` — próximas subtasks do Horizonte 2.
- Excluir branch — precisa de política adicional; fica para etapa
  posterior.
- Rebase, merge, cherry-pick.

## Critérios de aceite

- criar e trocar branch com nomes válidos funcionam; nomes inválidos
  ou operação em árvore suja falham com código dedicado;
- confirmação obrigatória; sem confirmação a mutação é recusada com
  409;
- testes de serviço, rota e componente montados passam;
- `npm run typecheck`, `npm run build` e `npm test` verdes.
