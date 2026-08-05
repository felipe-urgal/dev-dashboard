# Task 102 — Conselheiro de impacto após mudanças Git

## Status

Concluída.

## Objetivo

Depois de uma troca de branch, pull ou sincronização, comparar o SHA anterior
com o novo SHA e transformar os caminhos alterados em recomendações claras,
sem executar nenhuma ação automaticamente.

## Decisão principal

Classificador puro e declarativo de paths: recebe dois SHAs já capturados
pela própria mutação Git (nunca enviados pelo navegador), roda
`git diff --name-only` entre eles e aplica um catálogo fechado de regras
sobre os caminhos resultantes. O resultado aponta para áreas existentes do
dashboard (rota + label); não lê conteúdo de arquivo e não cria um executor
genérico.

## Escopo entregue

- contrato `ProjectChangeImpact`/`ProjectChangeImpactAction`/
  `ProjectChangeImpactCategory` em `packages/contracts/src/project-change-impact.ts`;
- `apps/api/src/services/project-change-impact-service.ts`: `classifyProjectChangeImpact`
  (função pura, testável sem Git) e `computeProjectChangeImpact` (roda o diff
  e aplica o classificador);
- cinco categorias fechadas, cada uma com deep link para uma rota que já
  existe no frontend: `dependencies` → `project-dependencies` (lockfiles Node:
  `package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`/`npm-shrinkwrap.json`, e
  `Gemfile.lock`), `database` → `project-database` (`db/migrate/` e
  `db/migrate_<banco>/` para múltiplos bancos, mesma convenção da task 059),
  `environment` → `project-environment` (`.env.example`/`.env.sample`),
  `server` → `project-server` (`Dockerfile`, `docker-compose*.yml`/`compose*.yml`,
  `Procfile`, `config/puma.rb`/`config/unicorn.rb`/`config/sidekiq.yml`/
  `config/webpacker.yml`), `tests` → `project-tests` (`spec/`, `test/`,
  `__tests__/`, `*.test.*`/`*.spec.*`, `*_test.rb`/`*_spec.rb`);
- `GitService.switchBranch`/`GitService.pull` (`apps/api/src/services/git-service.ts`)
  capturam o SHA de `HEAD` antes e depois da mutação e devolvem
  `GitBranchMutationResult { branch, impact }`;
- `GitSyncService.integrate`/`GitSyncService.synchronizeMain`
  (`apps/api/src/services/git-sync-service.ts`) computam `impact` a partir do
  `previousHead`/`currentHead` que já capturavam;
- schemas de resposta (`projectChangeImpactResponseSchema`,
  `projectChangeImpactActionResponseSchema` em
  `apps/api/src/http/response-schemas/git.ts`) e `impact` adicionado a
  `gitBranchMutationResponseSchema` (opcional — `create-branch`/`push` não
  carregam impacto) e ao `resultSchema` de `git-sync.ts` (obrigatório);
- frontend: `switchProjectGitBranch`/`pullProjectGitBranch`
  (`apps/web/src/api/git.ts`) passam a devolver `GitBranchMutationResult`
  inteiro em vez de só a string do branch; `useProjectGitPanel.ts` ganha
  `changeImpact` (limpo a cada mutação nova e a cada troca de projeto) e o
  aplica depois de trocar de branch, dar pull ou sincronizar a main;
  `ProjectGitChangeImpactBanner.vue` renderiza a lista de recomendações com
  `RouterLink` para a rota correspondente, exibido no painel Git logo abaixo
  da mensagem de sucesso da mutação.

## Critérios de aceite

- mudança de lockfile recomenda revisar/instalar dependências — coberto por
  `classifyProjectChangeImpact`/`computeProjectChangeImpact` e teste da
  mutação real de `switchBranch`;
- migrations recomendam abrir Banco de dados, inclusive em bancos
  secundários (`db/migrate_<nome>/`);
- `.env.example`/`.env.sample` recomenda revisar nomes de variáveis;
- configuração de servidor/worker (inclusive Docker/Compose) recomenda
  revisão manual — a recomendação nunca dispara reinício sozinha, porque
  nenhuma ação do catálogo é chamada automaticamente por este recurso;
- arquivos de teste recomendam executar testes, sem iniciar execução;
- diff inválido (SHA malformado) ou commits iguais produzem
  `{ changedPaths: [], actions: [] }` em vez de lançar erro — coberto por
  dois testes dedicados de `computeProjectChangeImpact`;
- nenhum conteúdo de arquivo, segredo ou caminho absoluto é devolvido: só
  `git diff --name-only`, caminhos relativos normalizados (`..`/`/` no
  início são descartados antes de classificar);
- nenhuma recomendação chama uma rota de mutação; o resultado é somente
  informativo, consumido pela UI como lista de deep links.

## Fora de escopo

- analisar conteúdo ou AST dos arquivos alterados;
- instalar dependências, migrar banco ou reiniciar processos
  automaticamente a partir de uma recomendação;
- comparar SHAs arbitrários enviados pelo navegador — os dois SHAs sempre
  vêm de uma mutação já executada pelo próprio serviço;
- IA ou recomendação probabilística;
- persistência histórica dos impactos — o resultado só existe na resposta
  da mutação que o gerou, sem tabela/armazenamento próprio.

## Validação

- testes focados: 11 do classificador/serviço puro
  (`project-change-impact-service.test.ts`), mais as asserções novas em
  `git-service-mutations.test.ts` (switch/pull) e `git-sync-service.test.ts`
  (integrate/synchronizeMain);
- `npm run typecheck` passou em todos os workspaces;
- `npm run build` passou;
- `npm test` passou (API, web, `core`, `process-manager`, `project-discovery`)
  sem quebrar nenhuma rota de mutação Git já testada (schemas
  `additionalProperties: false` continuam validando as respostas reais).

## Limitações conhecidas

- o catálogo de regras é fixo no código (sem configuração por projeto);
  ampliar categorias ou padrões exige uma nova entrega;
- só as três mutações que já capturavam (ou passaram a capturar) SHA
  anterior/novo disparam o cálculo — outras mutações (commit, stash, etc.)
  não geram impacto porque não trocam o `HEAD` para um commit diferente do
  que já estava staged/local.
