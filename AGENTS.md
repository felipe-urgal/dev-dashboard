# AGENTS.md

Guia rápido para agentes de IA (Claude Code, Cursor, Copilot, etc.) que
forem trabalhar neste repositório. Complementa o `CLAUDE.md` — leia
ambos antes de editar qualquer arquivo.

## O que é este projeto em uma frase

Um repositório com **duas interfaces** para o mesmo domínio: um CLI bash
em `lib/` (carregado no shell do usuário via `init.sh`) e um dashboard
web TypeScript em `apps/` + `packages/`. Nenhum dos dois substitui o
outro; o web reaproveita conceitos por trás de uma API HTTP local.

## Regras de ouro

1. **Idioma**: todo texto criado ou editado (UI, comentários, mensagens
   de commit, documentação, PRs) é em **português brasileiro**.
2. **Planejamento fora do repositório**: a pasta `tasks/` foi removida
   deliberadamente e não deve ser recriada. O backlog não é versionado
   neste repositório. Antes de começar, use o contexto fornecido, issues/PRs
   existentes quando houver e a documentação viva para delimitar o escopo.
   O PR deve registrar objetivo, decisões, riscos, validação e resultado real.
3. **Documentação sempre atualizada**: todo ajuste, correção ou nova
   funcionalidade que muda comportamento, rota, capacidade ou fluxo
   precisa atualizar o documento correspondente em `docs/` (arquitetura,
   guias, segurança) na mesma entrega — não depois. Uma mudança que altera
   comportamento sem atualizar `docs/` está incompleta (ver a tabela
   "Onde documentar" em `CONTRIBUTING.md`).
4. **Segurança da API**: leia `docs/architecture/security.md` antes de
   adicionar qualquer rota. A API é um processo privilegiado local:
   nada de shell arbitrário, `cwd` sempre do `ProjectStore`, catálogo
   de ações fechado, schemas de resposta explícitos.
5. **CLI bash e web são independentes**: mudanças em `lib/*` não
   precisam tocar em `apps/`/`packages/` e vice-versa. Se precisar de
   compartilhamento, decida deliberadamente e documente.
6. **UI dupla no CLI bash**: qualquer função interativa deve suportar
   `gum` **e** o fallback puro (`read -r -p` + menu numerado).

## Layout do repositório

```text
apps/
  api/         # Fastify, escuta em 127.0.0.1, autenticação por token
  web/         # Vue 3 + Vite SFCs, consome apenas a API
packages/
  contracts/         # Tipos TS puros compartilhados
  core/              # Configuração de workspaces, token local
  project-discovery/ # Detecção de projetos (Rails / Node)
  process-manager/   # Ciclo de vida de processos gerenciados
lib/                 # CLI bash original (carregado pelo ~/.bashrc)
docs/                # Documentação viva do produto e da engenharia
  architecture/      # overview.md, security.md, api-reference.md etc.
init.sh              # Entry point do CLI bash
```

## Comandos que você provavelmente vai rodar

```bash
npm install                    # uma vez, na raiz
npm run typecheck              # tsc --build em todos os workspaces
npm run build                  # packages primeiro, depois apps
npm test                       # --workspaces --if-present
npm run test:e2e               # build + smoke Playwright da web
npm run dev                    # API (:4343) + web (:5173) juntos
npm run lint                   # ESLint em apps/, packages/ e scripts/
npm run format:check           # Prettier, sem regravar
tests/cli/run.sh               # suíte do CLI bash (helpers não interativos)
```

`build:packages` roda `contracts → core → project-discovery →
process-manager`. Os apps importam **`dist/`**, não o TS fonte — se
esqueceu de rebuildar após editar um package, o typecheck pode mentir.

## Convenções da API (backend `apps/api`)

- Fastify + JSON Schema. Cada rota tem `params`, `body`, `querystring`
  e `response` declarados explicitamente.
- Schemas de resposta ficam em `apps/api/src/http/response-schemas.ts` e
  **descartam campos não listados na serialização** — é a última linha
  de defesa para evitar vazamento.
- Erros passam por `apps/api/src/http/api-error.ts` (`ApiError` e
  `ApiErrorCode`). Adicionou um erro novo? Adicione o código na união.
- Rotas privadas exigem o header `X-Dev-Dashboard-Token`
  (`apps/api/src/security/local-security.ts`). `GET /api/health` é a
  única pública.
- Processos gerenciados usam `packages/process-manager`. Os kinds atuais
  são `'server'`, `'test'`, `'worker'` e `'webpack'`; `MANAGED_KINDS` em
  `process-store.ts` é a fonte de verdade compartilhada com a retenção de
  logs. Processos de script têm ciclo de vida próprio em
  `apps/api/src/services/script-execution/` e não pertencem a esse store.

## Convenções do frontend (`apps/web`)

- Vue 3 SFCs. Chamadas à API só via `apps/web/src/api.ts` (`requestJson`
  centraliza o tratamento de erro).
- Nunca acesse filesystem, execute comandos ou faça polling em portas
  a partir do frontend — é responsabilidade da API.
- Ao trocar de projeto, painéis devem invalidar seu estado (padrão
  `generation` em `ProjectGitPanel.vue` / `ProjectTestsPanel.vue`).
- Rotas ficam em `apps/web/src/router/index.ts`. A `ProjectDetailsView`
  reaproveita o mesmo componente para as sub-rotas
  (`project-details`, `project-git`, `project-tests`).
- Estados visuais precisam ser honestos: loading só durante trabalho real,
  ações concorrentes bloqueadas quando necessário e respostas obsoletas
  descartadas após troca de contexto.

## Convenções do CLI bash (`lib/`)

- Comandos públicos: `dev-*`, `git-*`, `project-*` em kebab-case,
  exportados via `export -f`.
- Helpers privados: prefixados com `_`, snake_case, não exportados.
- Cada módulo de funcionalidade segue o trio
  `init.sh` + `helpers.sh` + `run.sh` (ou `start.sh` / `stop.sh` /
  `logs.sh` / `menu.sh`). Não invente convenção nova.
- Módulos opcionais são carregados com `required=false`; sua ausência
  emite aviso, não aborta.

## Testes

- Node test runner (`node --test`) com `tsx` para carregar `.ts`, exceto
  `apps/web` (Vitest para unitários/componentes, Playwright para o smoke
  E2E). Padrão de nome: `*.test.ts` em `test/` de cada workspace.
- CLI bash: os helpers **não interativos** (`_dev_*`/`_project_*`/`_git_*`
  puros, sem `gum`/`read -r -p`) têm suíte própria em `tests/cli/`
  (`tests/cli/run.sh`, só `bash` + `git`). Funções interativas continuam
  validadas manualmente, rodando a função direto num shell com o dashboard
  carregado. `lib/*/tests/` é outra coisa — menus para rodar a suíte do
  *projeto alvo* (ex. `bundle exec rspec`), não testes deste codebase.

## Como abrir e fechar uma entrega

1. Ler `docs/architecture/overview.md`, `docs/development-guide.md` e a
   documentação específica do domínio. Consultar também o contexto externo,
   issues e PRs relacionados quando existirem.
2. Confirmar o comportamento atual no código antes de reaproveitar qualquer
   débito ou plano antigo; não transformar histórico obsoleto em backlog novo.
3. Implementar na menor camada correta, adicionando teste automatizado quando
   o escopo suportar.
4. Rodar `npm run typecheck && npm run lint && npm run format:check && npm run build && npm test`.
   Rodar `npm run test:e2e` quando o fluxo web alterado justificar.
5. Atualizar a documentação viva correspondente na mesma entrega.
6. Fazer auto code review do diff, corrigir os achados e repetir os gates
   impactados antes do PR.
7. Abrir PR com objetivo, alterações, riscos, validação e impacto visual.
   Não fazer merge sem instrução explícita; quando autorizado, só mergear
   depois dos gates exigidos estarem verdes.

## O que evitar

- Recriar `tasks/`, `NEXT.md` ou `PENDENCIAS.md` como fonte de backlog.
- Executar `git` de escrita em nome do usuário sem instrução direta.
- Introduzir dependências novas em `packages/contracts` — ele é
  intencionalmente puro (só tipos).
- Aceitar caminhos absolutos vindos do navegador para operações de
  filesystem ou processo.
- Misturar convenções entre CLI bash e web sem discussão prévia.
- Deixar `dist/` desatualizado antes de rodar `dev`/`build`/`test`.
