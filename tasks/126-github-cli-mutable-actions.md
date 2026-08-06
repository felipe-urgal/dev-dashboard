# Task 126 — Expõe ações mutáveis do gh (criar/editar/fechar/mesclar PR)

## Contexto

`docs/architecture/security.md`, seção "Integração com o GitHub CLI (gh)",
já documentava que `gh` era usado apenas para leitura (fallback de
status/CI de PR) e que expor ações mutáveis (`pr create`/`edit`/`close`/
`merge`) exigiria, antes de implementar: um catálogo fechado de
subcomandos, o mesmo padrão de confirmação em duas etapas já usado nas
mutações Git, e uma decisão explícita sobre as ações destrutivas (`close`,
`merge`) ficarem habilitadas. `tasks/PENDENCIAS.md` registrava isso como
item em aberto (task 114 já tinha decidido o modelo de autorização, mas não
o catálogo em si).

Perguntado, o usuário confirmou: implementar as quatro ações
(`create`/`edit`/`close`/`merge`), todas com o mesmo fluxo de confirmação em
duas etapas (token de uso único) já usado no catálogo de scripts e nas
mutações Git.

## O que foi feito

- **Catálogo fechado**: quatro entradas novas em
  `packages/contracts/src/git-mutation-catalog.ts`
  (`pull-request-create`/`-edit`/`-close`/`-merge`), risco `write-remote`
  (criar/editar) ou `destructive` (fechar/mesclar), todas
  `requiresConfirmation: true`. Tipos de payload em
  `packages/contracts/src/git-pull-request-mutation.ts`.
- **Serviço**: `apps/api/src/services/git-pull-request-mutation-service.ts`
  — valida o catálogo e os campos por ação, exige remoto GitHub (reaproveita
  `requireRepository`/`currentBranch`/`remoteUrl`/`parseRemoteUrl`/
  `detectProvider` de `git-pull-request/*`, os mesmos helpers do serviço de
  leitura), monta os argumentos do `gh` (nunca uma string livre do
  navegador) e busca o estado canônico da PR via `gh pr view --json` após
  cada mutação (evita depender de parsing frágil do stdout de
  `create`/`edit`/`close`/`merge`). Execução do `gh` é injetável
  (`runGhImpl`) para testes sem depender do binário real.
- **Rotas**: `apps/api/src/routes/git-pull-request-mutations.ts` — dois
  endpoints genéricos dirigidos por `actionId` (mesmo padrão do catálogo de
  scripts): `POST .../git/pull-request/confirmations` e
  `POST .../git/pull-request/actions`. Erros mapeados por `ApiErrorCode`
  dedicados (`GIT_PULL_REQUEST_ACTION_NOT_FOUND`,
  `GIT_PULL_REQUEST_ACTION_INVALID_INPUT`,
  `GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED`,
  `GIT_PULL_REQUEST_MUTATION_FAILED`) mais os códigos já existentes de
  `GitPullRequestError` (`GIT_NOT_REPOSITORY`, `GIT_PULL_REQUEST_REMOTE_UNSUPPORTED`
  etc.). Toda execução passa por `withGitMutationHistory` — sucesso e falha
  aparecem no histórico compartilhado de mutações Git.
- **UI**: `apps/web/src/components/ProjectGitPullRequestPage.vue` ganhou
  "Criar direto com gh" (ao lado do fluxo existente de abrir no navegador) e,
  quando já existe uma PR aberta, "Mesclar com gh"/"Fechar com gh". Cada
  ação mostra o comando `gh` literal antes de confirmar; fechar/mesclar
  exigem digitar o número da PR para habilitar o botão de confirmação (mesmo
  padrão de "digite para confirmar" de `ProjectGitBranchesPage.vue`).
- **Segurança**: `docs/architecture/security.md` atualizado — a seção
  "O que isso não autoriza" virou "O que isso autoriza hoje" com o
  detalhamento do catálogo, confirmação e auditoria; a task 126 é registrada
  como a decisão explícita que habilitou `pr close`/`pr merge`.

## Decisões

- As quatro ações (não só as destrutivas) exigem confirmação — decisão
  explícita do usuário, não apenas o mínimo exigido pelo checklist.
- Ações restritas a remotos GitHub (`gh` não opera contra GitLab); um
  remoto GitLab é rejeitado antes de qualquer `execFile('gh', ...)`.
- Falhas do `gh` nunca propagam stdout/stderr bruto para o cliente —
  mensagem fixa via `GIT_PULL_REQUEST_MUTATION_FAILED`.
- Testes do serviço usam injeção de dependência (`runGhImpl`), não um
  binário `gh` real; o teste de rota usa um `gh` falso em `PATH` (mesmo
  padrão adotado na task 125 para `bundle`), garantindo reprodutibilidade
  em CI sem depender de autenticação real do GitHub.

## Arquivos

- `packages/contracts/src/git-mutation-catalog.ts`,
  `packages/contracts/src/git-pull-request-mutation.ts`,
  `packages/contracts/src/index.ts`.
- `apps/api/src/services/git-pull-request-mutation-service.ts`.
- `apps/api/src/routes/git-pull-request-mutations.ts`, `apps/api/src/app.ts`.
- `apps/api/src/http/api-error.ts`,
  `apps/api/src/routes/git-mutation-history-helpers.ts`.
- `apps/api/test/git-pull-request-mutation-service.test.ts`,
  `apps/api/test/git-pull-request-mutation-routes.test.ts`.
- `apps/web/src/api/git-workflows.ts`,
  `apps/web/src/components/ProjectGitPullRequestPage.vue`,
  `apps/web/src/components/ProjectGitPullRequestPage.css`.
- `apps/web/test/project-git-pull-request-page.test.ts`.
- `docs/architecture/security.md`, `docs/architecture/api-reference.md`
  (gerado), `tasks/PENDENCIAS.md`.

## Limitações

- Não há suporte a repositórios GitLab (o `gh` CLI é específico do GitHub) —
  documentado, rejeitado com erro claro.
- `pull-request-merge` não expõe a opção "excluir branch após merge" do
  `gh pr merge --delete-branch` — escopo mínimo definido com o usuário;
  pode ser adicionado depois se necessário.

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
```

Todos passando localmente (562 testes em `apps/api`, 364 em `apps/web`,
cobertura acima dos pisos configurados em ambos).
