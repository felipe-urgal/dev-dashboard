# Task 097 — Aba "Variáveis de ambiente" do projeto

## Objetivo

Exibir, somente leitura, as variáveis declaradas nos arquivos `.env` de um
projeto, sem nunca expor o valor de uma variável cujo nome pareça um segredo.
Diferente do painel Sidekiq/webpack/credentials (task 095, exclusivo de
projetos Rails), esta aba vale para qualquer tipo de projeto — `.env` é uma
convenção tanto Rails quanto Node.

## Decisões de segurança

- catálogo fechado de arquivos: apenas `.env`, `.env.local`,
  `.env.development`, `.env.test` e `.env.production` são lidos — a mesma
  lista já usada por `DatabaseDetectionService` para detectar `DATABASE_URL`;
- todo caminho é resolvido e contido dentro do diretório do projeto antes da
  leitura (`path.resolve` + checagem de prefixo), como as demais leituras de
  arquivo da API;
- reaproveita `isSensitiveEnvironmentProfileVariableName` (`packages/core`,
  já usada pela task 094) como heurística única de nome sensível
  (`SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL`, `PRIVATE`, `_KEY`/`KEY`,
  `APIKEY`) — uma variável com nome sensível nunca tem seu valor incluído na
  resposta da API, mesmo que o arquivo contenha o valor real;
- resposta e schema (`additionalProperties: false`) garantem que nenhum
  campo além de `name`/`value`/`sensitive` chegue ao navegador;
- rota somente leitura, sem mutação, sem confirmação (não há ação
  destrutiva).

## Escopo entregue

- contrato em `packages/contracts/src/project-environment.ts`
  (`ProjectEnvironmentOverview`, `ProjectEnvironmentFile`,
  `ProjectEnvironmentVariable`);
- `ProjectEnvironmentService` (`apps/api/src/services/project-environment-service.ts`)
  — parseia `NOME=valor` (com `export` opcional, aspas simples/duplas,
  comentários e linhas em branco ignorados);
- rota `GET /api/projects/:projectId/environment-variables`
  (`apps/api/src/routes/project-environment.ts`), registrada em
  `app-context.ts`/`app.ts`;
- nova aba "Variáveis de ambiente" em `ProjectDetailsView.vue`, disponível
  para todo tipo de projeto (sem gate por `project.type`);
- `ProjectEnvironmentPanel.vue` + `useProjectEnvironmentVariables.ts`
  (padrão `generation`, mesmo de `useProjectRailsCredentials`): um card por
  arquivo `.env` encontrado, tabela nome/valor, variável sensível mostra
  `StatusBadge` "Oculto (segredo)" em vez do valor.

## Testes automatizados

- `apps/api/test/project-environment-routes.test.ts`: autenticação
  obrigatória, valores não sensíveis presentes, valor de variável sensível
  ausente da resposta (inclusive verificação de que a string do segredo não
  aparece em lugar nenhum do JSON serializado), arquivo `.env.local` ausente
  não aparece na lista, projeto inexistente retorna 404;
- `apps/web/test/project-environment-panel.test.ts`: valor normal exibido,
  segredo oculto, HTML não contém o valor do segredo, estado vazio sem
  nenhum `.env` reconhecido;
- `apps/web/e2e/tests/project-environment.spec.ts`: fixture `sample-node-app`
  ganhou um `.env` com uma variável normal e uma sensível; smoke real
  confirma que a página nunca contém o valor do segredo.

## Limitações conhecidas

- não há edição nem criação de variáveis por esta aba — é somente leitura,
  igual ao padrão já adotado para credentials Rails;
- não há suporte a arquivos `.env` fora da lista fechada (ex. `.env.staging`
  customizado) — ampliar a lista é uma decisão de escopo separada;
- a heurística de nome sensível é a mesma de perfis de ambiente e pode ter
  falsos positivos/negativos (ex. `PUBLIC_KEY` de verificação assimétrica
  fica oculta mesmo não sendo secreta) — aceito como comportamento
  conservador intencional.
