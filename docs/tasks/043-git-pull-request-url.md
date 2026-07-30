# Task 043 — git-pr no painel Git

## Status

Concluída.

## Objetivo

Trazer para o painel Git do dashboard web uma ação equivalente ao `git-pr` do
CLI bash (`lib/git/pr/`): publicar o branch atual em "origin" quando ainda
não publicado (reaproveitando o push da task 025) e abrir a URL de criação
de PR/MR do provedor remoto (GitHub ou GitLab) com base e branch já
preenchidos — sem chamar a API do provedor nem exigir token de terceiros.
Próxima fatia da "paridade CLI→Web seletiva" do Horizonte 2, depois de
`git-save` (041) e `dev-clean` (042).

## Escopo entregue

- `GitPullRequestService` (`apps/api/src/services/git-pull-request-service.ts`):
  resolve a branch atual e a branch padrão (`refs/remotes/origin/HEAD`, com
  fallback para `main`/`master`/`develop`, espelhando `_git_default_branch`
  de `lib/git/helpers.sh`), recusa quando a branch atual já é a padrão, exige
  que a branch tenha upstream configurado (`@{u}`) e resolve a URL do remote
  "origin" — sem chamar `git ls-remote` nem qualquer API do provedor.
- Detecção de provedor pelo host do remote (`github.com` → GitHub,
  qualquer host contendo `gitlab` → GitLab); remotes SSH (`git@host:owner/repo.git`)
  e HTTPS são normalizados para `{host, ownerRepo}` via `URL`/regex scp-like,
  o que descarta credenciais eventualmente embutidas (`user:token@host`) da
  URL final — a composição só usa hostname e path, nunca userinfo. Host não
  reconhecido é um erro explícito (`GIT_PULL_REQUEST_REMOTE_UNSUPPORTED`),
  não um formato genérico adivinhado.
- URLs compostas: GitHub usa `/compare/{default}...{branch}?expand=1`;
  GitLab usa `/-/merge_requests/new` com `source_branch`/`target_branch`.
- Rota somente leitura `GET /projects/:projectId/git/pull-request-url`
  (`apps/api/src/routes/git-pull-request.ts`, no mesmo padrão de
  `gitWorkspaceRoutes`/`gitSyncRoutes` — serviço próprio, sem estado
  compartilhado do `GitService` de mutações): não exige o token de
  confirmação em duas etapas usado por push/commit/save, pois é apenas
  composição/leitura, sem efeito colateral no servidor.
- Painel Git (`ProjectGitPanel.vue`): ação "Abrir pull request" nas ações
  rápidas do resumo e na barra lateral "Publicar alterações" da aba
  Sincronização (`ProjectGitSyncPage.vue`). Quando a branch atual não tem
  upstream, confirma e reaproveita o fluxo de push já existente (mesma
  confirmação em duas etapas de `git/mutations/confirmations`) antes de
  buscar a URL; com upstream já configurado, busca a URL diretamente. Em
  qualquer caso, abre a URL resultante em nova aba (`window.open`).
- Testes de serviço cobrindo GitHub (SSH), GitLab (HTTPS com credenciais
  embutidas, verificando que não vazam na URL final), remote não
  reconhecido, branch igual à padrão, branch não publicada, ausência de
  remote "origin" e projeto que não é repositório Git; testes de componente
  cobrindo o caminho já publicado (chama a rota de composição diretamente) e
  o caminho não publicado (push primeiro, depois composição).

## Decisões e limitações

- Diferente das mutações Git (branch, pull, push, commit, save, stash), a
  composição da URL não usa `GitMutationOperation`/confirmação em duas
  etapas — é leitura pura, sem escrita no repositório. O único efeito
  colateral possível (publicar o branch) é o push já existente, com sua
  própria confirmação.
- Detecção de provedor cobre GitHub e GitLab (incluindo instâncias
  self-hosted de GitLab, via substring `gitlab` no host) — outros
  provedores (Bitbucket, Gitea etc.) recusam com erro claro em vez de
  adivinhar um formato de URL.
- Não há chamada à API do GitHub/GitLab para criar a PR de fato, listar
  revisores ou verificar se já existe uma PR aberta — abrir a URL de
  composição no navegador é a fatia proposta, como no roadmap.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Integração com a API do GitHub/GitLab (criar a PR de fato, listar
  revisores, verificar PR existente).
- Snapshot/restore de banco (fatia própria do mesmo item do roadmap).
- `dev-kill-port` (decisão registrada na task 042).
