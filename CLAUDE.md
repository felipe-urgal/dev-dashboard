# CLAUDE.md

Este arquivo fornece orientações ao Claude Code ao trabalhar com código neste
repositório. Leia também `AGENTS.md`, `CONTRIBUTING.md` e a documentação viva em
`docs/` antes de editar arquivos.

## O que é isto

O projeto possui **duas interfaces compartilhando um mesmo repositório**:

1. **CLI bash original** — dashboard interativo em `lib/`, carregado no shell
   do usuário via `init.sh`. Continua suportado e não é substituído pelo web.
2. **Dashboard web** — monorepo TypeScript com npm workspaces: `apps/api`
   (Fastify), `apps/web` (Vue 3 + Vite) e `packages/*` compartilhados.

A migração é incremental e deliberada. Não assuma que mudanças em uma
interface precisam alterar a outra.

Textos de UI, comentários, mensagens de commit e documentação são escritos em
**português brasileiro**.

Toda mudança que altera comportamento, rota, capacidade ou fluxo precisa
atualizar a documentação viva correspondente em `docs/` na mesma entrega. A
tabela "Onde documentar" em `CONTRIBUTING.md` é a referência para escolher o
documento correto.

## Planejamento e histórico

A pasta `tasks/` foi removida deliberadamente do repositório. **Não recrie
`tasks/`, `NEXT.md` ou `PENDENCIAS.md`.** O backlog não é versionado aqui.

Antes de iniciar um trabalho:

- use o contexto fornecido pelo usuário;
- consulte issues e PRs relacionados quando existirem;
- leia a documentação viva do domínio;
- confirme no código se débitos ou planos antigos ainda se aplicam.

O PR é o registro versionado do resultado da entrega: objetivo, decisões,
riscos, testes, impacto visual e limitações. `docs/` continua sendo apenas a
fonte viva do produto e da engenharia, não um histórico de tasks.

## Fluxo de desenvolvimento

### CLI bash

```bash
source ~/.dev-dashboard/init.sh
dev-doctor
dev-help
dev-tools
```

Como a maior parte das funções é interativa, valide a função alterada em um
shell com o dashboard carregado. Helpers não interativos possuem suíte própria:

```bash
tests/cli/run.sh
```

`lib/*/tests/` contém menus para rodar testes do projeto alvo; não é a suíte do
Dev Dashboard.

`init.sh` protege contra carregamento duplicado via `DEV_LOADED`. Em testes com
múltiplos `source`, use um shell novo ou remova essa variável antes de recarregar.

### Dashboard web (`apps/`, `packages/`)

```bash
npm install

npm run dev
npm run dev:api
npm run dev:web
npm run dev-web
npm run doctor

npm run typecheck
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run build
npm test
npm run test:coverage
npm run test:e2e

npm run docs:api
npm run docs:api:check
npm run release -- <patch|minor|major>
```

Os scripts `build`, `typecheck`, `dev`, `dev:api`, `dev:web`, `test` e
`test:coverage` executam `build:packages` antes dos apps quando necessário. Os
apps importam a saída compilada em `dist/`, não diretamente os fontes
TypeScript dos packages.

O `package.json` raiz exige Node `^20.19.0 || >=22.12.0`.

`.github/workflows/ci.yml` mantém um único job `Validate` em Node 24 com
instalação otimizada (`npm ci --ignore-scripts` + rebuild explícito de
`esbuild`/`node-pty`), lint, testes funcionais e build dos apps. Coverage,
format check, CLI Bash, E2E, typecheck isolado e Node mínimo são validações
direcionadas conforme o risco da mudança, não jobs obrigatórios em todo PR.

Coverage é diagnóstico sob demanda via `npm run test:coverage`; não existe
threshold percentual obrigatório. A prioridade é proteger regra de negócio,
contratos, segurança, mutações, concorrência/cleanup, regressões reais e
comportamento relevante da UI. Evite testes criados apenas para aumentar
percentual ou congelar detalhes incidentais de CSS/markup.

### Rodando um teste específico

Cada workspace usa `node --test` com `tsx`, exceto `apps/web` (Vitest +
Playwright):

```bash
# API / packages
npm run build --workspace=@dev-dashboard/contracts
node --import=tsx --test apps/api/test/processes.test.ts

# Web unitário/componente
npm run test --workspace=@dev-dashboard/web -- caminho/do/arquivo.test.ts

# Web E2E, a partir de apps/web/
npx playwright test --config=e2e/playwright.config.ts caminho/do/arquivo.spec.ts
```

## Monorepo do dashboard web

- **`apps/api`** — Fastify + JSON Schema, escuta somente em `127.0.0.1`.
  Rotas ficam em `apps/api/src/routes/*.ts`; cada rota declara `params`,
  `querystring`, `body` e `response`. Erros públicos passam por
  `ApiError`/`ApiErrorCode`. Schemas de resposta compartilhados ficam em
  `apps/api/src/http/response-schemas.ts`.
- **`apps/web`** — Vue 3 SFCs. Toda chamada HTTP passa por
  `apps/web/src/api.ts`; o frontend não executa comandos locais nem acessa o
  filesystem. Ao trocar de projeto, painéis invalidam estado assíncrono pelo
  padrão `generation`.
- **`packages/contracts`** — apenas tipos compartilhados; sem Fastify, Vue ou
  dependências novas de infraestrutura.
- **`packages/core`** — configuração de workspaces e armazenamento do token
  local da API.
- **`packages/project-discovery`** — descoberta de projetos Rails/Node.
- **`packages/process-manager`** — ciclo de vida de processos conhecidos,
  iniciado sem `shell: true`, com validação de PID/cwd e TERM antes de KILL.

Os kinds gerenciados atuais são `'server'`, `'test'`, `'worker'` e `'webpack'`.
`MANAGED_KINDS` em `process-store.ts` é a fonte de verdade para o store e
retenção de logs. Execuções de scripts têm ciclo de vida próprio em
`apps/api/src/services/script-execution/` e não fazem parte desse store.

Não existe adaptador compartilhado entre o CLI bash e o monorepo. Uma extração
comum exige decisão arquitetural e modelo de ameaça próprios.

Narrativa completa: `docs/architecture/overview.md`.

## Modelo de segurança da API

A API é um processo local privilegiado. Leia `docs/architecture/security.md`
antes de criar ou alterar endpoints.

- Escuta somente em `127.0.0.1`, nunca em `0.0.0.0`.
- Catálogo fechado de ações; nenhuma linha de shell arbitrária vem do browser.
- Token local aleatório é exigido em rotas privadas via
  `X-Dev-Dashboard-Token`; `GET /api/health` é pública.
- CORS usa lista fechada de origens locais.
- Caminhos recebidos da interface não podem escapar do projeto/workspace
  autorizado.
- Leituras de log e arquivo possuem limites.
- Schemas de resposta descartam campos não declarados antes da serialização.
- Operações sensíveis exigem confirmação explícita quando aplicável.

## Padrões do frontend

- Estados de loading precisam refletir trabalho real.
- Ações concorrentes devem ser bloqueadas apenas quando existe risco real de
  corrida.
- Respostas obsoletas precisam ser descartadas após troca de projeto/contexto.
- Mantenha estados de vazio, erro, sucesso e progresso explícitos.
- Revise foco, teclado, responsividade e movimento reduzido.
- Prefira UI simples, ágil e funcional; remova redundância antes de adicionar
  novos elementos.

## Internals do CLI bash

As seções abaixo descrevem especificamente `lib/` + `init.sh`.

### Ordem de carregamento

`init.sh` é o ponto de entrada e carrega módulos em ordem de dependência:

1. `lib/core/init.sh`;
2. `lib/projects/init.sh`;
3. `lib/server/init.sh`;
4. `lib/ui/init.sh`, `lib/actions/init.sh`, `lib/dashboard/init.sh`;
5. `lib/doctor/init.sh`;
6. `lib/git/init.sh`, `lib/rails/init.sh`, `lib/node/init.sh` como módulos
   opcionais;
7. `load_project_config` + `detect_projects`;
8. exportação das funções públicas necessárias em subshells.

Pastas de funcionalidade seguem a convenção existente:

- `init.sh` carrega os arquivos do módulo;
- `helpers.sh` contém lógica privada;
- `run.sh` ou arquivos por verbo (`start.sh`, `stop.sh`, `logs.sh`, `menu.sh`)
  contêm ações públicas.

Não invente uma nova convenção de carregamento sem necessidade arquitetural.

### Convenção de nomes

- Comandos públicos: kebab-case, normalmente `dev-*`, `git-*` e `project-*`.
- Helpers privados: prefixo `_`, snake_case, não exportados salvo dependência
  explícita entre módulos.

### Estado global

- `DEV_BASE` — raiz escaneada em busca de projetos.
- `DEV_DASHBOARD_DIR` — localização resolvida desta instalação.
- `DEV_RUN_DIR` — estado temporário de processos por UID.
- `PROJECT_META` — metadados dos projetos detectados.
- `PROJECT_CONFIG` — overrides de configuração de projetos.
- `~/.dev-dashboard.secrets` — configuração opcional com permissões restritas.

### UI com `gum` e fallback

Funções interativas precisam manter os dois caminhos suportados:

- UI com `gum`, quando disponível;
- fallback puro com `read -r -p`, menus numerados e `echo`.

A ausência de `gum` é um aviso, não erro. Mudanças de UI do CLI devem validar
ambos os ramos.

### Gerenciamento de processos

O CLI inicia servidores por `_dev_start_server`, registra PID/log em
`DEV_RUN_DIR` e encerra com TERM antes de KILL. Rails e Node compartilham esse
núcleo. Ao alterar esse fluxo, preserve cleanup, checagem de porta e identidade
do processo.

### Fluxo de router/menu

`dev-tools` → `dev-dashboard` → `project-menu` → `dev-project-actions` →
`dev-run-command`.

Uma nova ação de topo normalmente exige atualizar o menu, o `case` do router e,
para sessões interativas longas, a regra que evita `_dev_pause` duplicado.

## Fechamento de uma entrega

1. Confirme a camada correta e o escopo real no código atual.
2. Implemente com testes de regressão/regra quando houver algo relevante a
   proteger; não adicione teste apenas por coverage.
3. Para uma mudança normal, rode `npm run lint && npm test && npm run build`.
   Acrescente `typecheck`, `format:check`, `test:cli`, `test:e2e`,
   `test:coverage`, Node mínimo e outros gates quando o risco justificar.
4. Atualize a documentação viva correspondente.
5. Faça auto code review do diff e aplique os ajustes encontrados.
6. Abra PR com objetivo, riscos, validação e impacto visual.
7. Não faça merge sem instrução explícita e sem os checks exigidos verdes.
